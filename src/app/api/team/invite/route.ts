import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function gerarSenhaTemporaria(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

    // Verifica identidade e cargo do solicitante
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

    // Cria o usuário no Supabase Auth com senha temporária aleatória
    const senhaTemp = gerarSenhaTemporaria();
    const { data: novoUsuario, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senhaTemp,
        email_confirm: true,
        user_metadata: { full_name: nome },
    });

    if (createError) {
        if (createError.message.includes('already registered')) {
            return NextResponse.json({ erro: 'Este e-mail já está cadastrado.' }, { status: 409 });
        }
        console.error('[team/invite] Erro ao criar usuário:', createError.message);
        return NextResponse.json({ erro: 'Erro ao criar acesso.' }, { status: 500 });
    }

    // Associa o novo usuário à empresa do diretor
    await supabaseAdmin
        .from('profiles')
        .upsert({ id: novoUsuario.user!.id, nome, cargo, unidade: unidade || null, cpf: cpf || null, empresa_id: empresaId });

    // Gera link de redefinição de senha para o novo usuário definir a própria senha
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
    });

    if (linkError || !linkData?.properties?.action_link) {
        // Usuário criado mas sem link — ainda funciona, só não envia email
        console.error('[team/invite] Erro ao gerar link de convite:', linkError?.message);
        return NextResponse.json({ ok: true, aviso: 'Acesso criado. Não foi possível enviar o e-mail de convite.' });
    }

    // Envia o e-mail de convite via Resend
    if (process.env.RESEND_API_KEY) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const link = linkData.properties.action_link;

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
            Clique no botão abaixo para criar sua senha e acessar o sistema.
          </p>
          <a href="${link}" style="display:inline-block;background:#22c55e;color:#0f172a;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding:14px 28px;border-radius:10px;text-decoration:none">
            Criar minha senha
          </a>
          <p style="margin:24px 0 0;font-size:11px;color:#475569">
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
