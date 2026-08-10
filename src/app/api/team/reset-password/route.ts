import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function gerarSenhaTemporaria(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Reseta a senha direto via Admin API (define uma nova senha temporária), em vez do
// fluxo de link de recovery por e-mail — que dependia da URL de redirect estar liberada
// no Supabase e do token no hash sobreviver até a página carregar, e vinha falhando
// (ver histórico de fixes em reset-password/route.ts e team/invite). Mesmo approach
// já usado no convite de novo usuário.
export async function POST(request: Request) {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.replace('Bearer ', '');

    if (!accessToken) {
        return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: { user: solicitante }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !solicitante) {
        return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });
    }

    const { data: perfilSolicitante } = await supabaseAdmin
        .from('profiles')
        .select('cargo, empresa_id')
        .eq('id', solicitante.id)
        .single();

    if (perfilSolicitante?.cargo !== 'diretor') {
        return NextResponse.json({ erro: 'Acesso restrito a diretores.' }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
        return NextResponse.json({ erro: 'userId obrigatório.' }, { status: 422 });
    }

    const { data: perfilAlvo } = await supabaseAdmin
        .from('profiles')
        .select('nome, empresa_id')
        .eq('id', userId)
        .single();

    if (perfilAlvo?.empresa_id !== perfilSolicitante.empresa_id) {
        return NextResponse.json({ erro: 'Usuário não pertence à sua empresa.' }, { status: 403 });
    }

    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getUserError || !userData?.user?.email) {
        return NextResponse.json({ erro: 'Usuário não encontrado no Auth.' }, { status: 404 });
    }
    const email = userData.user.email;

    const senhaTemp = gerarSenhaTemporaria();
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: senhaTemp });
    if (updateError) {
        console.error('[team/reset-password] Erro ao redefinir senha:', updateError.message);
        return NextResponse.json({ erro: `Erro ao redefinir senha: ${updateError.message}` }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';

    if (process.env.RESEND_API_KEY) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        try {
            const { error: sendError } = await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
                to: [email],
                subject: 'Sua senha foi redefinida — WeGrow',
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
          <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#fff">Olá, ${perfilAlvo?.nome || ''}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
            Sua senha de acesso ao WeGrow foi redefinida por um administrador. Use os dados abaixo pra entrar.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:24px">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #1e293b">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">E-mail</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#fff">${email}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">Nova senha</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#22c55e;letter-spacing:3px;font-family:monospace">${senhaTemp}</p>
              </td>
            </tr>
          </table>

          <a href="${appUrl}/login" style="display:inline-block;background:#22c55e;color:#0f172a;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding:14px 28px;border-radius:10px;text-decoration:none">
            Acessar o sistema
          </a>

          <p style="margin:24px 0 0;font-size:12px;color:#475569;line-height:1.6">
            Após o acesso, recomendamos alterar sua senha em <strong style="color:#94a3b8">Configurações → Equipe</strong>.
          </p>
          <p style="margin:12px 0 0;font-size:11px;color:#334155">
            Se você não esperava essa mudança, avise o administrador.
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
            if (sendError) {
                console.error('[team/reset-password] Erro ao enviar e-mail:', sendError.message);
                // Senha já foi redefinida — devolve pro admin repassar manualmente já que o e-mail falhou
                return NextResponse.json({ ok: true, aviso: 'Senha redefinida, mas o e-mail não pôde ser enviado.', senhaTemp, email });
            }
        } catch (emailError: any) {
            console.error('[team/reset-password] Erro ao enviar e-mail:', emailError?.message);
            return NextResponse.json({ ok: true, aviso: 'Senha redefinida, mas o e-mail não pôde ser enviado.', senhaTemp, email });
        }
        return NextResponse.json({ ok: true });
    }

    // Sem Resend configurado — devolve a senha pro admin repassar manualmente
    return NextResponse.json({ ok: true, aviso: 'Senha redefinida. E-mail não configurado no servidor.', senhaTemp, email });
}
