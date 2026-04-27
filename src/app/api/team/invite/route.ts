import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function gerarSenhaTemporaria(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

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

    const empresaId = perfilSolicitante.empresa_id;
    if (!empresaId) {
        return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
    }

    const { nome, email, cargo, unidade, cpf } = body;
    if (!nome || !email || !cargo) {
        return NextResponse.json({ erro: 'Nome, e-mail e cargo são obrigatórios.' }, { status: 422 });
    }

    const cargosValidos = ['vendedor', 'gerente', 'diretor'];
    if (!cargosValidos.includes(cargo)) {
        return NextResponse.json({ erro: 'Cargo inválido.' }, { status: 422 });
    }

    const senhaTemp = gerarSenhaTemporaria();

    const { data: novoUsuario, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senhaTemp,
        email_confirm: true,
        user_metadata: { full_name: nome },
    });

    if (createError) {
        if (createError.message.toLowerCase().includes('already') || createError.message.toLowerCase().includes('registered')) {
            return NextResponse.json({ erro: 'Este e-mail já está cadastrado.' }, { status: 409 });
        }
        console.error('[team/invite] Erro ao criar usuário:', createError.message);
        return NextResponse.json({ erro: `Erro ao criar acesso: ${createError.message}` }, { status: 500 });
    }

    await supabaseAdmin
        .from('profiles')
        .upsert({ id: novoUsuario.user!.id, nome, cargo, unidade: unidade || null, cpf: cpf || null, empresa_id: empresaId });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';

    if (process.env.RESEND_API_KEY) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'WeGrow CRM <onboarding@resend.dev>',
            to: [email],
            subject: 'Seu acesso ao WeGrow CRM',
            html: `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">
        <tr><td style="background:#22c55e;padding:24px 32px">
          <span style="font-size:22px;font-weight:900;font-style:italic;color:#0f172a;letter-spacing:-1px">WEGROW CRM</span>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#fff">Olá, ${nome}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
            Você foi adicionado à equipe do WeGrow CRM com o cargo <strong style="color:#fff">${cargo}</strong>.
            Use os dados abaixo para acessar o sistema agora mesmo.
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
          <p style="margin:12px 0 0;font-size:11px;color:#334155">
            Se você não esperava esse acesso, ignore este e-mail.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #1e293b">
          <p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow CRM · Este e-mail é confidencial</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
}
