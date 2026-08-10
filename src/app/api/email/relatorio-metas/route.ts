import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function fmt(v: number) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function barraHtml(perc: number, cor: string) {
  const p = Math.max(0, Math.min(100, Math.round(perc)));
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;background:#1e293b">
      <tr>
        <td width="${p}%" style="background:${cor};height:10px;font-size:0;line-height:0">&nbsp;</td>
        <td style="height:10px;font-size:0;line-height:0">&nbsp;</td>
      </tr>
    </table>`;
}

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ erro: 'Serviço de e-mail não configurado.' }, { status: 503 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  const {
    email, escopo, periodo,
    metaAno, realizadoAno, percentAno,
    metaMesAtual, realizadoMesAtual, esperadoAteHoje, ritmoOk, deltaRitmo, projecaoFechamento,
    diaAtual, diasNoMes, nomeMes,
    ranking,
  } = body;

  if (!email) {
    return NextResponse.json({ erro: 'E-mail é obrigatório.' }, { status: 422 });
  }

  const corAno = percentAno >= 100 ? '#22c55e' : '#3b82f6';

  const rankingArray: { nome: string; realizado: number; meta: number; perc: number }[] = Array.isArray(ranking) ? ranking : [];
  const rankingHtml = rankingArray.length > 0 ? `
    <p style="margin:28px 0 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:2px">Ranking do Mês</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e293b;border-radius:8px;overflow:hidden">
      ${rankingArray.slice(0, 5).map((v, i) => `
        <tr style="${i % 2 === 0 ? 'background:#111827' : ''}">
          <td style="padding:10px 12px;font-size:12px;color:#64748b;font-weight:700;width:24px">#${i + 1}</td>
          <td style="padding:10px 12px;font-size:13px;color:#e2e8f0;font-weight:700">${v.nome}</td>
          <td style="padding:10px 12px;font-size:12px;color:#94a3b8;text-align:right">${fmt(v.realizado)} / ${fmt(v.meta)}</td>
          <td style="padding:10px 12px;font-size:13px;font-weight:900;text-align:right;color:${v.perc >= 100 ? '#22c55e' : v.perc >= 60 ? '#3b82f6' : '#f97316'}">${Math.round(v.perc)}%</td>
        </tr>`).join('')}
    </table>
  ` : '';

  const html = `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">

        <!-- HEADER -->
        <tr><td style="background:#3b82f6;padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:22px;font-weight:900;font-style:italic;color:#fff;letter-spacing:-1px">WEGROW</span></td>
              <td align="right"><span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px">Relatório de Metas</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- BODY -->
        <tr><td style="padding:32px">

          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:2px">${escopo || 'Global Empresa'}</p>
          <p style="margin:0 0 28px;font-size:20px;font-weight:900;color:#fff">${periodo || ''}</p>

          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:2px">Meta Anual x Realizado</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
            <tr>
              <td style="font-size:13px;color:#94a3b8">Realizado: <strong style="color:#fff">${fmt(realizadoAno)}</strong></td>
              <td align="right" style="font-size:20px;font-weight:900;color:${corAno}">${Math.round(percentAno)}%</td>
            </tr>
          </table>
          ${barraHtml(percentAno, corAno)}
          <p style="margin:8px 0 0;font-size:11px;color:#64748b">Meta do ano: ${fmt(metaAno)} · Falta: <strong style="color:#f87171">${fmt(Math.max(0, metaAno - realizadoAno))}</strong></p>

          ${metaMesAtual > 0 ? `
          <div style="margin-top:24px;padding:16px;border-radius:12px;background:${ritmoOk ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)'};border:1px solid ${ritmoOk ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}">
            <p style="margin:0 0 4px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:${ritmoOk ? '#22c55e' : '#fb923c'}">${ritmoOk ? '✓ Ritmo no Verde' : '⚠ Abaixo do Ritmo Esperado'} — ${nomeMes || ''}</p>
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8">Dia ${diaAtual}/${diasNoMes} — Esperado: <strong style="color:#fff">${fmt(esperadoAteHoje)}</strong> · Realizado: <strong style="color:#fff">${fmt(realizadoMesAtual)}</strong></p>
            <p style="margin:0;font-size:12px;color:#94a3b8">${ritmoOk ? 'Adiantado' : 'Faltam'} <strong style="color:${ritmoOk ? '#22c55e' : '#fb923c'}">${fmt(deltaRitmo)}</strong> ${ritmoOk ? 'acima do ritmo' : 'para atingir o ritmo'}</p>
            ${projecaoFechamento > 0 ? `<p style="margin:6px 0 0;font-size:12px;color:#64748b">Projeção de fechamento: <strong style="color:${projecaoFechamento >= metaMesAtual ? '#22c55e' : '#fb923c'}">${fmt(projecaoFechamento)}</strong> (${Math.round((projecaoFechamento / metaMesAtual) * 100)}% da meta do mês)</p>` : ''}
          </div>` : ''}

          ${rankingHtml}

        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding:20px 32px;border-top:1px solid #1e293b">
          <p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow · Relatório gerado automaticamente · Confidencial</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
      to: [email],
      subject: `Relatório de Metas — ${periodo || ''}`,
      html,
    });

    if (error) {
      console.error('[email/relatorio-metas] Resend error:', error);
      return NextResponse.json({ erro: 'Falha ao enviar e-mail.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[email/relatorio-metas] unexpected error:', err);
    return NextResponse.json({ erro: 'Erro interno.' }, { status: 500 });
  }
}
