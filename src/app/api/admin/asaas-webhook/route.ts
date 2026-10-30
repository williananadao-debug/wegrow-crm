import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { emitirNfWegrow, sincronizarNfWegrow } from '@/lib/nfWegrow';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Webhook da conta Asaas da PRÓPRIA WeGrow (cobrança das mensalidades, /api/admin/cobranca).
// Diferente de /api/financeiro/webhook, que recebe das contas Asaas de cada tenant.
//  - PAYMENT_RECEIVED / PAYMENT_CONFIRMED → emite a NFS-e da mensalidade (se a automação estiver ligada)
//  - INVOICE_*                            → atualiza a nota e, autorizada, manda o e-mail pro cliente
// Configurar no Asaas (Integrações → Webhooks) com o token em ASAAS_WEBHOOK_TOKEN_WEGROW.
export async function POST(request: Request) {
  // Token obrigatório: sem ele qualquer um poderia forjar um "pagamento recebido" e disparar nota.
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN_WEGROW;
  if (!esperado || request.headers.get('asaas-access-token') !== esperado) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const { event, payment, invoice } = body;
  const db = supabaseAdmin();

  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event) && payment?.externalReference) {
    const empresaId = payment.externalReference;
    const { data: billing } = await db.from('clientes_wegrow').select('empresa_id').eq('empresa_id', empresaId).maybeSingle();
    if (!billing) return NextResponse.json({ ok: true, skipped: true });

    await db.from('clientes_wegrow').update({ ultima_cobranca_status: payment.status }).eq('empresa_id', empresaId).eq('ultima_cobranca_id', payment.id);
    const r = await emitirNfWegrow(db, { empresaId, paymentId: payment.id, competencia: String(payment.dueDate || '').substring(0, 7) || undefined, origem: 'webhook' });
    console.log(`[admin/asaas-webhook] ${event} empresa=${empresaId}`, r.ok ? 'nf ok' : r.erro);
    return NextResponse.json({ ok: true });
  }

  if (String(event || '').startsWith('INVOICE_') && invoice?.id) {
    const { data: nota } = await db.from('wegrow_notas_fiscais').select('*').eq('asaas_invoice_id', invoice.id).maybeSingle();
    if (!nota) return NextResponse.json({ ok: true, skipped: true });
    await sincronizarNfWegrow(db, nota, invoice);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, skipped: true });
}
