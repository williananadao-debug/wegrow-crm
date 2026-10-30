// Operações de acesso a um tenant (criar empresa + diretor, entrar como, nova senha) usadas
// tanto pelo God Mode (/api/admin/*) quanto pelo Portal do Parceiro (/api/parceiro) — cada
// rota faz a própria checagem de permissão ANTES de chamar isso; aqui não tem gate nenhum.
// Só roda no servidor (service role).
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export function gerarSenhaTemporaria(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

type Falha = { erro: string; status: number };

// Diretor da empresa (ou, sem diretor, qualquer usuário dela) — é quem recebe o link de
// "entrar como" e a senha nova.
async function usuarioPrincipal(db: SupabaseClient, empresaId: string, semUsuario: string): Promise<{ id: string; email: string } | Falha> {
  const { data: profileDiretor } = await db.from('profiles')
    .select('id').eq('empresa_id', empresaId).eq('cargo', 'diretor').limit(1).maybeSingle();

  let profileId = profileDiretor?.id as string | undefined;
  if (!profileId) {
    const { data: qualquerProfile } = await db.from('profiles')
      .select('id').eq('empresa_id', empresaId).limit(1).maybeSingle();
    profileId = qualquerProfile?.id;
  }
  if (!profileId) return { erro: semUsuario, status: 404 };

  const { data: userData, error: userError } = await db.auth.admin.getUserById(profileId);
  if (userError || !userData?.user?.email) {
    return { erro: 'Não consegui recuperar o e-mail do usuário dessa empresa.', status: 500 };
  }
  return { id: profileId, email: userData.user.email };
}

// Link mágico do Supabase pro diretor daquela empresa — sessão real do usuário real (não
// bypassa RLS, não precisa de tabela de override).
export async function gerarLinkEntrarComo(db: SupabaseClient, empresaId: string): Promise<{ link: string; email: string } | Falha> {
  const alvo = await usuarioPrincipal(db, empresaId, 'Nenhum usuário encontrado pra essa empresa — não dá pra entrar como ela.');
  if ('erro' in alvo) return alvo;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: alvo.email,
    options: { redirectTo: `${appUrl}/` },
  });
  if (linkError || !linkData?.properties?.action_link) {
    return { erro: linkError?.message || 'Falha ao gerar o link de acesso.', status: 500 };
  }
  return { link: linkData.properties.action_link, email: alvo.email };
}

// Senha temporária nova pro diretor, já trocada de verdade no Supabase Auth. Existe porque a
// senha temporária só aparece uma vez na criação e, se ninguém copiar a tempo, não tem como
// recuperar.
export async function resetarSenhaDiretor(db: SupabaseClient, empresaId: string): Promise<{ email: string; senha: string } | Falha> {
  const alvo = await usuarioPrincipal(db, empresaId, 'Nenhum usuário encontrado pra essa empresa — não dá pra resetar senha de ninguém.');
  if ('erro' in alvo) return alvo;

  const senhaTemp = gerarSenhaTemporaria();
  const { error: updateError } = await db.auth.admin.updateUserById(alvo.id, { password: senhaTemp });
  if (updateError) return { erro: `Falha ao trocar a senha: ${updateError.message}`, status: 500 };
  return { email: alvo.email, senha: senhaTemp };
}

export type NovaEmpresa = {
  nome: string;
  cnpj?: string | null;
  plano?: string;
  status?: string;
  modulos?: Record<string, any>;
  diretorNome: string;
  diretorEmail: string;
  parceiroId?: string | null;
};

// Cria empresa nova (novo tenant, UUID gerado pelo banco) + primeiro diretor + e-mail de
// boas-vindas. A lista do God Mode é montada a partir de profiles, não de empresas — uma
// empresa sem nenhum usuário nunca aparece, por isso o diretor é obrigatório.
export async function criarEmpresaComDiretor(db: SupabaseClient, n: NovaEmpresa): Promise<
  ({ empresa: any; diretorEmail: string; senhaTemp: string; emailErro: string | null }) | (Falha & { empresa?: any })
> {
  const { data: empresa, error: empresaError } = await db
    .from('empresas')
    .insert([{
      nome: n.nome, cnpj: n.cnpj || null, plano: n.plano || 'essencial', status: n.status || 'trial', modulos: n.modulos || {},
      ...(n.parceiroId ? { parceiro_id: n.parceiroId } : {}),
    }])
    .select()
    .single();

  if (empresaError) return { erro: empresaError.message, status: 500 };

  const senhaTemp = gerarSenhaTemporaria();
  const { data: novoUsuario, error: createError } = await db.auth.admin.createUser({
    email: n.diretorEmail,
    password: senhaTemp,
    email_confirm: true,
    user_metadata: { full_name: n.diretorNome },
  });

  if (createError) {
    // Status fora da faixa 200-299 de propósito — 207 fazia o front-end (que só olha
    // res.ok) tratar isso como sucesso, escondendo o aviso. A empresa ficava criada em
    // "empresas" mas sem nenhum profile, e como a listagem do God Mode é montada a
    // partir de profiles (não de empresas), ela nunca aparecia — sem erro nenhum visível.
    const msg = createError.message.toLowerCase().includes('already') || createError.message.toLowerCase().includes('registered')
      ? `Empresa "${n.nome}" criada, mas esse e-mail já tem conta em outro lugar — convide o diretor manualmente em Minha Equipe (ou use outro e-mail).`
      : `Empresa "${n.nome}" criada, mas falhou ao criar o diretor: ${createError.message}`;
    return { erro: msg, status: 409, empresa };
  }

  const { error: profileError } = await db.from('profiles').upsert({ id: novoUsuario.user!.id, nome: n.diretorNome, cargo: 'diretor', empresa_id: empresa.id });
  if (profileError) {
    return { erro: `Empresa "${n.nome}" e usuário criados, mas falhou ao vincular o perfil: ${profileError.message} — por isso ela não aparece na lista.`, status: 409 };
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
      to: [n.diretorEmail],
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
          <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#fff">Olá, ${n.diretorNome}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
            A empresa <strong style="color:#fff">${n.nome}</strong> foi criada no WeGrow e você é o diretor responsável.
            Use os dados abaixo para acessar o sistema agora mesmo.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:24px">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #1e293b">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">E-mail</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#fff">${n.diretorEmail}</p>
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
    console.error('[criarEmpresaComDiretor] falha ao enviar e-mail de boas-vindas:', err);
    emailErro = err?.message || 'Falha ao enviar e-mail de boas-vindas.';
  }

  return { empresa, diretorEmail: n.diretorEmail, senhaTemp, emailErro };
}
