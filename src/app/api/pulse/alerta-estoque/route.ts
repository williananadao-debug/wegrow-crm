import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Disparado pelo cliente no exato momento em que um produto cruza o estoque mínimo
// (ajuste manual, venda). Não é um cron/webhook — só cobre os caminhos que decrementam
// estoque que já existem no código (ajustarEstoque, finalizarVenda, converterEmPedido).
export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Serviço de e-mail não configurado.' }, { status: 503 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { data: { user: solicitante }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !solicitante) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }
  const { data: perfilSolicitante } = await supabaseAdmin
    .from('profiles')
    .select('empresa_id, nome')
    .eq('id', solicitante.id)
    .single();
  if (!perfilSolicitante?.empresa_id) {
    return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });
  }

  try {
    const { servicoId } = await req.json();
    if (!servicoId) return NextResponse.json({ error: 'servicoId é obrigatório.' }, { status: 400 });

    const { data: servico } = await supabaseAdmin
      .from('servicos').select('id, nome, estoque, estoque_minimo, empresa_id')
      .eq('id', servicoId).eq('empresa_id', perfilSolicitante.empresa_id).single();
    if (!servico) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });

    const { data: destinatarios } = await supabaseAdmin
      .from('profiles').select('email').eq('empresa_id', perfilSolicitante.empresa_id).in('cargo', ['diretor', 'gerente']);
    const emails = (destinatarios || []).map((d: any) => d.email).filter(Boolean);
    if (emails.length === 0) return NextResponse.json({ skipped: true, reason: 'Sem diretor/gerente com e-mail cadastrado.' });

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
      to: emails,
      subject: `⚠️ Estoque baixo: ${servico.nome}`,
      html: `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">
        <tr><td style="background:#ef4444;padding:20px 28px">
          <span style="font-size:18px;font-weight:900;font-style:italic;color:#fff">⚠️ ESTOQUE BAIXO</span>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 16px;font-size:16px;color:#fff">O produto <strong>${servico.nome}</strong> está com estoque baixo:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:20px">
            <tr>
              <td style="padding:14px 18px;border-bottom:1px solid #1e293b">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase">Estoque atual</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#ef4444">${servico.estoque}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 18px">
                <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase">Mínimo configurado</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#94a3b8">${servico.estoque_minimo}</p>
              </td>
            </tr>
          </table>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br'}/pulse/estoque" style="display:inline-block;background:#22c55e;color:#0f172a;font-weight:900;font-size:13px;text-transform:uppercase;padding:14px 28px;border-radius:10px;text-decoration:none">
            Ver estoque
          </a>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #1e293b">
          <p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow · Alerta automático de estoque</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });

    return NextResponse.json({ sent: true, para: emails.length });
  } catch (err: any) {
    console.error('[Pulse Alerta Estoque] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
