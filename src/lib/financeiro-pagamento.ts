import type { SupabaseClient } from '@supabase/supabase-js';

// Compartilhado entre o webhook da Asaas (financeiro/webhook, reage a evento automático) e a
// verificação manual (financeiro/cobranca?verificar, botão "Verificar status" na tela de
// venda) — mesma lógica de "marcar como pago" nos dois casos, pra não divergir: webhook que
// não chegou (empresa configurou depois, Asaas não reenviou, etc.) e clique manual têm que
// deixar os dados exatamente no mesmo estado final.
//
// 1. Marca a cobrança específica (por asaasPaymentId) como paga dentro de leads.cobrancas_manuais.
// 2. Se a soma das cobranças pagas (não canceladas) bater com o valor_total da venda, marca
//    também o lançamento financeiro correspondente como pago — pagamento parcial não fecha
//    o lançamento inteiro (ele representa a venda toda).
export async function confirmarPagamentoCobranca(
  supabaseAdmin: SupabaseClient,
  leadId: number | string,
  asaasPaymentId: string,
  dataPagamento: string,
): Promise<{ ok: true; jaEstavaPago: boolean } | { ok: false; erro: string }> {
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id, valor_total, cobrancas_manuais')
    .eq('id', leadId)
    .single();
  if (leadErr || !lead) return { ok: false, erro: 'Venda não encontrada.' };

  const cobrancasAtuais = Array.isArray(lead.cobrancas_manuais) ? lead.cobrancas_manuais : [];
  let encontrou = false;
  let jaEstavaPago = false;
  const cobrancasAtualizadas = cobrancasAtuais.map((c: any) => {
    if (c.asaasPaymentId !== asaasPaymentId) return c;
    encontrou = true;
    jaEstavaPago = Boolean(c.pago);
    return { ...c, pago: true, dataPagamento };
  });
  if (encontrou) {
    await supabaseAdmin.from('leads').update({ cobrancas_manuais: cobrancasAtualizadas }).eq('id', leadId);
  }

  const totalPago = cobrancasAtualizadas
    .filter((c: any) => !c.cancelada && c.pago)
    .reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);
  const valorTotal = Number(lead.valor_total) || 0;

  if (valorTotal > 0 && totalPago >= valorTotal - 0.01) {
    const leadRef = `LD-${String(lead.id).padStart(4, '0')}`;
    const { data: porLeadId } = await supabaseAdmin
      .from('lancamentos').select('id').eq('lead_id', lead.id).eq('status', 'pendente');
    const { data: porTitulo } = (!porLeadId || porLeadId.length === 0)
      ? await supabaseAdmin.from('lancamentos').select('id').ilike('titulo', `%${leadRef}%`).eq('status', 'pendente')
      : { data: null };
    const idsParaPagar = (porLeadId && porLeadId.length > 0 ? porLeadId : porTitulo || []).map((l: any) => l.id);
    if (idsParaPagar.length > 0) {
      await supabaseAdmin.from('lancamentos')
        .update({ status: 'pago', data_pagamento: dataPagamento, asaas_payment_id: asaasPaymentId })
        .in('id', idsParaPagar);
    }
  }

  return { ok: true, jaEstavaPago };
}
