import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, confereSenha, criarSessao, opcoesCookie, soDigitos } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

const MAX_ERROS = 5, BLOQUEIO_MIN = 15;

// App do cliente: entrar com CPF/CNPJ (ou celular) + senha permanente. 5 erros = 15 min bloqueado.
export async function POST(req: NextRequest) {
  const { login, senha } = await req.json().catch(() => ({}));
  const l = soDigitos(login).replace(/^55(?=\d{10,11}$)/, '');
  const s = String(senha || '').trim().toLowerCase();
  const erro = (msg = 'Login ou senha incorretos.', status = 401) => NextResponse.json({ error: msg }, { status });
  if (l.length < 10 || s.length < 4) return erro();

  const db = supabaseAdmin();
  // O mesmo CPF pode ser cliente de mais de uma central: vale a que bater a senha.
  const { data: cands } = await db.from('rastreio_clientes')
    .select('id, empresa_id, status, app_senha_hash, app_senha_erros, app_senha_bloqueio_ate')
    .eq('app_login', l).not('app_senha_hash', 'is', null).neq('status', 'cancelado').limit(10);
  if (!cands?.length) return erro();

  const agora = Date.now();
  const livres = cands.filter(c => !c.app_senha_bloqueio_ate || Date.parse(c.app_senha_bloqueio_ate) < agora);
  if (!livres.length) return erro(`Muitas tentativas. Espere ${BLOQUEIO_MIN} minutos e tente de novo.`, 429);

  const certo = livres.find(c => confereSenha(s, c.app_senha_hash));
  if (!certo) {
    for (const c of livres) {
      const n = (c.app_senha_erros || 0) + 1;
      await db.from('rastreio_clientes').update(n >= MAX_ERROS
        ? { app_senha_erros: 0, app_senha_bloqueio_ate: new Date(agora + BLOQUEIO_MIN * 60_000).toISOString() }
        : { app_senha_erros: n }).eq('id', c.id);
    }
    return erro();
  }

  await db.from('rastreio_clientes').update({ app_senha_erros: 0, app_senha_bloqueio_ate: null }).eq('id', certo.id);
  const sessao = await criarSessao(db, { empresaId: certo.empresa_id, clienteId: certo.id, dispositivo: req.headers.get('user-agent') || undefined });
  const r = NextResponse.json({ ok: true });
  r.cookies.set(COOKIE_APP, sessao, opcoesCookie());
  return r;
}
