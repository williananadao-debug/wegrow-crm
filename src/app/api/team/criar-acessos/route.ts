import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DOMINIO_ACESSO_INTERNO, slugLogin } from '@/lib/loginSemEmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CARGOS_PERMITIDOS = ['producao', 'almoxarifado', 'vendedor'];

// POST { nomes: string[], senha, sufixo, cargo } — cria acessos SEM e-mail em lote (equipe de
// fábrica). Cada linha pode trazer a própria senha: "Helton; helton731" (senão vale a padrão).
// Login = "<primeiro nome>.<sufixo>" (ex.: helton.travel); no Auth vira
// <login>@acesso.wegrow.app.br, que nunca recebe e-mail. Nome repetido ganha número
// (fabio.travel, fabio2.travel). Só diretor. Pelo admin API do Supabase — pelo SQL Editor não
// dá: o Supabase não deixa gravar em auth.identities por lá.
export async function POST(req: Request) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).maybeSingle();
  if (perfil?.cargo !== 'diretor' || !perfil.empresa_id) return NextResponse.json({ erro: 'Acesso restrito a diretores.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const senhaPadrao = String(body?.senha || '');
  // "Nome; senha" ou "Nome<TAB>senha" (colado de planilha) — senha da linha vale sobre a padrão.
  const linhas = Array.isArray(body?.nomes) ? body.nomes.map((n: unknown) => String(n).trim()).filter(Boolean) : [];
  const porNome = new Map<string, string>();
  for (const linha of linhas) {
    const [nomeBruto, senhaLinha] = linha.split(/[;,\t]/);
    const nomeLimpo = (nomeBruto || '').trim().replace(/\s+/g, ' ');
    if (nomeLimpo) porNome.set(nomeLimpo, (senhaLinha || '').trim() || senhaPadrao);
  }
  const nomes = [...porNome.keys()];
  const sufixo = slugLogin(String(body?.sufixo || ''));
  const cargo = String(body?.cargo || 'producao');
  if (nomes.length === 0 || nomes.length > 50) return NextResponse.json({ erro: 'Informe de 1 a 50 nomes.' }, { status: 400 });
  const curtas = nomes.filter(n => (porNome.get(n) || '').length < 6);
  if (curtas.length) return NextResponse.json({ erro: `Senha com menos de 6 caracteres (ou sem senha): ${curtas.join(', ')}.` }, { status: 400 });
  if (!sufixo) return NextResponse.json({ erro: 'Informe o sufixo do login (ex.: travel).' }, { status: 400 });
  if (!CARGOS_PERMITIDOS.includes(cargo)) return NextResponse.json({ erro: 'Cargo inválido.' }, { status: 400 });

  const resultados: { nome: string; login?: string; senha?: string; erro?: string }[] = [];
  for (const nome of nomes) {
    const senha = porNome.get(nome)!;
    const base = slugLogin(nome.split(' ')[0]) || 'usuario';
    let criado: { id: string; login: string } | null = null;
    let ultimoErro = '';
    for (let n = 1; n <= 9 && !criado; n++) {
      const login = `${base}${n > 1 ? n : ''}.${sufixo}`;
      const { data, error } = await db.auth.admin.createUser({
        email: `${login}@${DOMINIO_ACESSO_INTERNO}`, password: senha, email_confirm: true,
        user_metadata: { nome, full_name: nome },
      });
      if (data?.user) criado = { id: data.user.id, login };
      else if (error && /already|registered|exists/i.test(error.message)) continue;
      else { ultimoErro = error?.message || 'erro desconhecido'; break; }
    }
    if (!criado) { resultados.push({ nome, erro: ultimoErro || 'login já existe' }); continue; }

    // O gatilho handle_new_user cria o perfil como "vendedor" sem empresa — ajusta aqui.
    const { error: erroPerfil } = await db.from('profiles')
      .upsert({ id: criado.id, nome, cargo, empresa_id: perfil.empresa_id });
    if (erroPerfil) {
      await db.auth.admin.deleteUser(criado.id).catch(() => {});
      resultados.push({ nome, erro: erroPerfil.message });
      continue;
    }
    resultados.push({ nome, login: criado.login, senha });
  }

  return NextResponse.json({ ok: true, resultados });
}
