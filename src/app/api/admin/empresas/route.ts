import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

// GET — lista todos os tenants reais (de profiles) mesclados com metadados de empresas
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();

  const [{ data: profiles, error: errProfiles }, { data: empresasData, error: errEmpresas }] = await Promise.all([
    db.from('profiles').select('empresa_id, nome, cargo, email').not('empresa_id', 'is', null),
    db.from('empresas').select('*'),
  ]);

  if (errProfiles) console.error('[admin/empresas] profiles error:', errProfiles);
  if (errEmpresas) console.error('[admin/empresas] empresas error:', errEmpresas);

  // Agrupa por empresa_id — fonte da verdade são os profiles
  const tenantMap = new Map<string, { diretor: string; total: number }>();
  for (const p of profiles || []) {
    if (!p.empresa_id) continue;
    const atual = tenantMap.get(p.empresa_id) || { diretor: '', total: 0 };
    atual.total++;
    if (p.cargo === 'diretor' && !atual.diretor) atual.diretor = p.nome || p.email || '';
    tenantMap.set(p.empresa_id, atual);
  }

  const empMap = new Map((empresasData || []).map(e => [e.id, e]));

  const resultado = Array.from(tenantMap.entries()).map(([id, t]) => {
    const emp = empMap.get(id);
    return {
      id,
      nome: emp?.nome || t.diretor || id,
      cnpj: emp?.cnpj || null,
      plano: emp?.plano || 'essencial',
      status: emp?.status || 'trial',
      modulos: emp?.modulos || {},
      logo_url: emp?.logo_url || null,
      created_at: emp?.created_at || null,
      canal_origem: emp?.canal_origem || null,
      cancelado_em: emp?.cancelado_em || null,
      total_usuarios: t.total,
      configurado: !!emp,
    };
  });

  return NextResponse.json(resultado);
}

function gerarSenhaTemporaria(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// POST — cria empresa nova (novo tenant, UUID gerado pelo banco) + primeiro diretor.
// A lista deste admin (GET acima) é montada a partir de profiles, não de empresas — uma
// empresa sem nenhum usuário nunca aparece na lista, então criar só o registro em
// "empresas" deixava o tenant invisível/inutilizável. Por isso o diretor é obrigatório aqui.
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { nome, cnpj, plano, status, modulos, diretorNome, diretorEmail } = body;
  if (!nome) return NextResponse.json({ erro: 'Nome obrigatório.' }, { status: 422 });
  if (!diretorNome || !diretorEmail) {
    return NextResponse.json({ erro: 'Nome e e-mail do diretor são obrigatórios — sem um usuário, a empresa não aparece em lugar nenhum do admin.' }, { status: 422 });
  }

  const db = supabaseAdmin();

  const { data: empresa, error: empresaError } = await db
    .from('empresas')
    .insert([{ nome, cnpj, plano: plano || 'essencial', status: status || 'trial', modulos: modulos || {} }])
    .select()
    .single();

  if (empresaError) return NextResponse.json({ erro: empresaError.message }, { status: 500 });

  const senhaTemp = gerarSenhaTemporaria();
  const { data: novoUsuario, error: createError } = await db.auth.admin.createUser({
    email: diretorEmail,
    password: senhaTemp,
    email_confirm: true,
    user_metadata: { full_name: diretorNome },
  });

  if (createError) {
    // Status fora da faixa 200-299 de propósito — 207 fazia o front-end (que só olha
    // res.ok) tratar isso como sucesso, escondendo o aviso. A empresa ficava criada em
    // "empresas" mas sem nenhum profile, e como a listagem do God Mode é montada a
    // partir de profiles (não de empresas), ela nunca aparecia — sem erro nenhum visível.
    const msg = createError.message.toLowerCase().includes('already') || createError.message.toLowerCase().includes('registered')
      ? `Empresa "${nome}" criada, mas esse e-mail já tem conta em outro lugar — convide o diretor manualmente em Minha Equipe (ou use outro e-mail).`
      : `Empresa "${nome}" criada, mas falhou ao criar o diretor: ${createError.message}`;
    return NextResponse.json({ erro: msg, empresa }, { status: 409 });
  }

  const { error: profileError } = await db.from('profiles').upsert({ id: novoUsuario.user!.id, nome: diretorNome, cargo: 'diretor', empresa_id: empresa.id });
  if (profileError) {
    return NextResponse.json({ erro: `Empresa "${nome}" e usuário criados, mas falhou ao vincular o perfil: ${profileError.message} — por isso ela não aparece na lista.` }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
  let emailErro: string | null = null;
  // Falha de e-mail (ex: domínio do Resend em modo sandbox, que só manda pro próprio e-mail
  // verificado da conta) não pode derrubar a criação da empresa — usuário e empresa já
  // existem nesse ponto. Sem o try/catch, uma exceção aqui travava a tela pra sempre: o
  // fetch do front nunca recebia resposta JSON válida e "saving" nunca voltava a false.
  try {
    if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
      to: [diretorEmail],
      subject: 'Seu acesso ao WeGrow',
      html: `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">
        <tr><td style="background:#22c55e;padding:24px 32px">
          <span style="font-size:22px;font-weight:900;font-style:italic;color:#0f172a;letter-spacing:-1px">WEGROW</span>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#fff">Olá, ${diretorNome}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
            A empresa <strong style="color:#fff">${nome}</strong> foi criada no WeGrow e você é o diretor responsável.
            Use os dados abaixo para acessar o sistema agora mesmo.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:24px">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #1e293b">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">E-mail</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#fff">${diretorEmail}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">Senha temporária</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#22c55e;letter-spacing:3px;font-family:monospace">${senhaTemp}</p>
              </td>
            </tr>
          </table>

          <a href="${appUrl}/login" style="display:inline-block;background:#22c55e;color:#0f172a;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding:14px 28px;border-radius:10px;text-decoration:none">
            Acessar o sistema
          </a>

          <p style="margin:24px 0 0;font-size:12px;color:#475569;line-height:1.6">
            Após o primeiro acesso, recomendamos alterar sua senha em <strong style="color:#94a3b8">Configurações → Equipe</strong>.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #1e293b">
          <p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow · Este e-mail é confidencial</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
    }
  } catch (err: any) {
    console.error('[admin/empresas] falha ao enviar e-mail de boas-vindas:', err);
    emailErro = err?.message || 'Falha ao enviar e-mail de boas-vindas.';
  }

  return NextResponse.json({ ...empresa, diretorEmail, senhaTemp, emailErro }, { status: 201 });
}

// PATCH — upsert por id (cria registro na tabela empresas se ainda não existir para esse tenant)
export async function PATCH(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ erro: 'ID obrigatório.' }, { status: 422 });

  // Upsert direto via service role (ignora RLS), não mais a RPC admin_upsert_empresa —
  // ela só existia no banco, não versionada em migration nenhuma, e nome/plano/status às
  // vezes não salvavam sem erro nenhum aparecer (bug opaco, impossível de debugar sem ver
  // o corpo da função). Só entra no patch a chave que realmente veio no corpo, pra nunca
  // zerar um campo que o chamador não mandou (ex: AbaGeral não manda cnpj).
  const CAMPOS_PERMITIDOS = ['nome', 'cnpj', 'plano', 'status', 'modulos', 'canal_origem', 'cancelado_em'];
  const patch: Record<string, any> = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (campo in campos) patch[campo] = campos[campo] ?? null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { data: existente } = await db.from('empresas').select('id').eq('id', id).maybeSingle();

  if (existente) {
    // Caso comum: linha já existe — UPDATE simples, só toca nas colunas que vieram no
    // corpo. Nunca passa pelo caminho de INSERT do upsert, então nunca esbarra em NOT
    // NULL de coluna que essa chamada específica não mandou (ex: "nome" quando só se quis
    // trocar "modulos").
    const { data, error } = await db.from('empresas').update(patch).eq('id', id).select().single();
    if (error) {
      console.error('[admin/empresas] PATCH (update) error:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // Linha ainda não existe (profile com empresa_id órfão, sem registro em "empresas" —
  // cenário que a antiga RPC também cobria). Aqui sim é INSERT de verdade, então precisa
  // de nome — sem ele o banco rejeita (NOT NULL), e sem esse aviso o erro cru do Postgres
  // não deixa claro o motivo.
  if (!patch.nome) {
    return NextResponse.json({ erro: 'Essa empresa ainda não tem registro criado — informe o nome antes de editar outro campo (abre a aba Geral e salva o nome primeiro).' }, { status: 422 });
  }
  const { data, error } = await db.from('empresas').insert({
    id,
    nome: patch.nome,
    cnpj: patch.cnpj ?? null,
    plano: patch.plano ?? 'essencial',
    status: patch.status ?? 'trial',
    modulos: patch.modulos ?? {},
    ...('canal_origem' in patch ? { canal_origem: patch.canal_origem } : {}),
    ...('cancelado_em' in patch ? { cancelado_em: patch.cancelado_em } : {}),
  }).select().single();

  if (error) {
    console.error('[admin/empresas] PATCH (insert) error:', error);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
