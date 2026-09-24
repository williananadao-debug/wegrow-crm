import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Webhook de confirmação de pagamento da Asaas (configurado em cada conta Asaas própria de
// cada empresa, apontando pra cá) — quando um boleto/Pix gerado pela tela de venda
// (leads.cobrancas_manuais, ver /api/financeiro/cobranca) é pago:
// 1. Marca a cobrança específica (por asaasPaymentId) como paga dentro da venda — antes só
//    ficava sabendo pelo extrato da própria Asaas, o CRM nunca mostrava "pago" em lugar
//    nenhum (relatado pelo usuário).
// 2. Se, somando as cobranças não-canceladas já pagas, o valor bater com o valor_total da
//    venda, marca também o lançamento financeiro (Financeiro > Entradas) correspondente
//    como pago — pagamento PARCIAL não marca o lançamento inteiro como pago (ele representa
//    a venda toda, não uma parcela), só quando o total da venda estiver de fato quitado.
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

    const hoje = new Date().toISOString().substring(0, 10);

    // Mantido por compatibilidade — algum relatório antigo pode ler esse campo direto do
    // lead pra "data em que a venda foi paga". Não faz mal manter, mesmo com o resto abaixo.
    await supabaseAdmin.from('leads').update({ data_pagamento: hoje }).eq('id', leadId);

    const { data: lead, error: leadErr } = await supabaseAdmin
        .from('leads')
        .select('id, valor_total, cobrancas_manuais')
        .eq('id', leadId)
        .single();
    if (leadErr || !lead) {
        console.error('[financeiro/webhook] Lead não encontrado:', leadId, leadErr?.message);
        return NextResponse.json({ ok: false }, { status: 404 });
    }

    const cobrancasAtuais = Array.isArray(lead.cobrancas_manuais) ? lead.cobrancas_manuais : [];
    let encontrou = false;
    const cobrancasAtualizadas = cobrancasAtuais.map((c: any) => {
        if (c.asaasPaymentId !== asaasPaymentId) return c;
        encontrou = true;
        return { ...c, pago: true, dataPagamento: hoje };
    });
    if (encontrou) {
        await supabaseAdmin.from('leads').update({ cobrancas_manuais: cobrancasAtualizadas }).eq('id', leadId);
    } else {
        // Cobrança não gerada por essa tela (ex: link avulso criado direto na Asaas) — segue
        // só com o resto (data_pagamento do lead já foi setado acima).
        console.log(`[financeiro/webhook] asaasPaymentId ${asaasPaymentId} não encontrado em cobrancas_manuais do lead ${leadId} — seguindo sem marcar cobrança específica.`);
    }

    const totalPago = cobrancasAtualizadas
        .filter((c: any) => !c.cancelada && c.pago)
        .reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);
    const valorTotal = Number(lead.valor_total) || 0;

    // Tolerância de 1 centavo pra não falhar por arredondamento entre as parcelas.
    if (valorTotal > 0 && totalPago >= valorTotal - 0.01) {
        const leadRef = `LD-${String(lead.id).padStart(4, '0')}`;
        // lead_id é o link de verdade (lançamentos criados a partir de hoje já gravam isso);
        // lançamentos antigos (antes dessa coluna existir) caem no fallback por título, igual
        // ao mesmo padrão já usado em docuseal/webhook pra achar jobs de produção pelo briefing.
        const { data: porLeadId } = await supabaseAdmin
            .from('lancamentos').select('id').eq('lead_id', lead.id).eq('status', 'pendente');
        const { data: porTitulo } = (!porLeadId || porLeadId.length === 0)
            ? await supabaseAdmin.from('lancamentos').select('id').ilike('titulo', `%${leadRef}%`).eq('status', 'pendente')
            : { data: null };
        const idsParaPagar = (porLeadId && porLeadId.length > 0 ? porLeadId : porTitulo || []).map((l: any) => l.id);

        if (idsParaPagar.length > 0) {
            await supabaseAdmin.from('lancamentos')
                .update({ status: 'pago', data_pagamento: hoje, asaas_payment_id: asaasPaymentId })
                .in('id', idsParaPagar);
            console.log(`[financeiro/webhook] Lançamento(s) ${idsParaPagar.join(',')} marcado(s) como pago (venda ${leadRef} quitada).`);
        } else {
            console.log(`[financeiro/webhook] Venda ${leadRef} quitada, mas nenhum lançamento pendente encontrado pra marcar como pago.`);
        }
    }

    console.log(`[financeiro/webhook] Lead ${leadId}, cobrança ${asaasPaymentId} confirmada (${event}). Total pago: ${totalPago}/${valorTotal}.`);
    return NextResponse.json({ ok: true });
}
