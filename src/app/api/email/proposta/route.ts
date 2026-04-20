import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ erro: 'Serviço de e-mail não configurado.' }, { status: 503 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  const { email, empresa, itens, valor_total, desconto, vendedor_nome, referencia } = body;

  if (!email || !empresa) {
    return NextResponse.json({ erro: 'E-mail e empresa são obrigatórios.' }, { status: 422 });
  }

  const itensArray: { servico: string; quantidade: number; precoUnitario: number }[] = Array.isArray(itens) ? itens : [];
  const subtotal = itensArray.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0);
  const total = Math.max(0, subtotal - (desconto || 0));

  const itensHtml = itensArray.length > 0
    ? itensArray.map(i => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:13px;color:#e2e8f0">${i.servico}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;font-size:13px;color:#e2e8f0">${i.quantidade}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;font-size:13px;color:#e2e8f0">R$ ${(i.quantidade * i.precoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:10px 12px;color:#64748b;font-size:13px">Detalhes a combinar</td></tr>`;

  const descontoHtml = desconto > 0
    ? `<tr><td colspan="2" style="padding:6px 12px;text-align:right;font-size:12px;color:#ef4444">Desconto</td><td style="padding:6px 12px;text-align:right;font-size:12px;color:#ef4444">- R$ ${Number(desconto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">

        <!-- HEADER -->
        <tr><td style="background:#22c55e;padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:22px;font-weight:900;font-style:italic;color:#0f172a;letter-spacing:-1px">WEGROW</span></td>
              <td align="right"><span style="font-size:11px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:1px">Proposta Comercial</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- BODY -->
        <tr><td style="padding:32px">

          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:2px">Para</p>
          <p style="margin:0 0 24px;font-size:20px;font-weight:900;color:#fff">${empresa}</p>

          ${referencia ? `<p style="margin:0 0 24px;font-size:11px;color:#64748b">Ref: ${referencia}</p>` : ''}

          <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:2px">Itens da Proposta</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e293b;border-radius:8px;overflow:hidden;margin-bottom:24px">
            <thead>
              <tr style="background:#1e293b">
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Serviço</th>
                <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Qtd</th>
                <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itensHtml}
              ${descontoHtml}
              <tr style="background:#1e293b">
                <td colspan="2" style="padding:12px;text-align:right;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase">Investimento Final</td>
                <td style="padding:12px;text-align:right;font-size:18px;font-weight:900;color:#22c55e">R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">
            Esta proposta foi preparada especialmente para você. Para avançar ou tirar dúvidas, entre em contato diretamente com <strong style="color:#fff">${vendedor_nome || 'nosso consultor'}</strong>.
          </p>

        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding:20px 32px;border-top:1px solid #1e293b">
          <p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow CRM · Demais FM · Esta proposta é confidencial</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'WeGrow CRM <onboarding@resend.dev>',
      to: [email],
      subject: `Proposta Comercial — ${empresa}`,
      html,
    });

    if (error) {
      console.error('[email/proposta] Resend error:', error);
      return NextResponse.json({ erro: 'Falha ao enviar e-mail.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[email/proposta] unexpected error:', err);
    return NextResponse.json({ erro: 'Erro interno.' }, { status: 500 });
  }
}
