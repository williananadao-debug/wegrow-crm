import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Rota temporária de uso único — envia e-mails de credenciais já geradas para contas
// já criadas. Não cria usuário nenhum. Removida logo após o uso pontual.
const TEMP_SECRET = '55515efa94427fc6aa84ed26f9197190ecc91f0241dd312f';

export async function POST(req: Request) {
  const secret = req.headers.get('x-temp-secret');
  if (secret !== TEMP_SECRET) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ erro: 'RESEND_API_KEY não configurado no servidor.' }, { status: 500 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 }); }

  const usuarios: { nome: string; email: string; cargo: string; senha: string }[] = body?.usuarios || [];
  if (!usuarios.length) return NextResponse.json({ erro: 'lista vazia' }, { status: 422 });

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';

  const resultados = [];
  for (const u of usuarios) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'WeGrow CRM <onboarding@resend.dev>',
        to: [u.email],
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
          <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#fff">Olá, ${u.nome}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
            Você foi adicionado à equipe do WeGrow CRM com o cargo <strong style="color:#fff">${u.cargo}</strong>.
            Use os dados abaixo para acessar o sistema agora mesmo.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:24px">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #1e293b">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">E-mail</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#fff">${u.email}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">Senha temporária</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#22c55e;letter-spacing:3px;font-family:monospace">${u.senha}</p>
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
      resultados.push({ email: u.email, status: 'enviado' });
    } catch (err: any) {
      resultados.push({ email: u.email, status: 'erro: ' + err.message });
    }
  }

  return NextResponse.json({ ok: true, resultados });
}
