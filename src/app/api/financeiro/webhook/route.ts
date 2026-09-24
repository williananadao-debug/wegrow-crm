import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { confirmarPagamentoCobranca } from '@/lib/financeiro-pagamento';

export const dynamic = 'force-dynamic';

// Webhook de confirmação de pagamento da Asaas (configurado em cada conta Asaas própria de
// cada empresa, apontando pra cá) — quando um boleto/Pix gerado pela tela de venda
// (leads.cobrancas_manuais, ver /api/financeiro/cobranca) é pago, marca a cobrança e o
// lançamento financeiro correspondentes como pagos (confirmarPagamentoCobranca — mesma lógica
// usada pela verificação manual, "Verificar status", pro caso desse webhook nunca chegar).
export async function POST(request: Request) {
    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

    const { event, payment } = body;

    if (!['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event)) {
        return NextResponse.json({ ok: true, skipped: true });
    }

    const leadId = payment?.externalReference;
    const asaasPaymentId = payment?.id;
    if (!leadId || !asaasPaymentId) return NextResponse.json({ ok: true, skipped: true });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    // paymentDate/confirmedDate vêm da própria Asaas (data real da confirmação); hoje só é
    // fallback caso o payload não traga nenhum dos dois.
    const dataPagamento = payment?.paymentDate || payment?.confirmedDate || new Date().toISOString().substring(0, 10);

    // Mantido por compatibilidade — algum relatório antigo pode ler esse campo direto do
    // lead pra "data em que a venda foi paga". Não faz mal manter, mesmo com o resto abaixo.
    await supabaseAdmin.from('leads').update({ data_pagamento: dataPagamento }).eq('id', leadId);

    const resultado = await confirmarPagamentoCobranca(supabaseAdmin, leadId, asaasPaymentId, dataPagamento);
    if (!resultado.ok) {
        console.error('[financeiro/webhook]', resultado.erro);
        return NextResponse.json({ ok: false }, { status: 404 });
    }

    console.log(`[financeiro/webhook] Lead ${leadId}, cobrança ${asaasPaymentId} confirmada (${event}).`);
    return NextResponse.json({ ok: true });
}
