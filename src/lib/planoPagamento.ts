// Plano de pagamento de uma venda, do jeito que o cliente vê no Portal do Cliente e a equipe
// marca na tela da venda. Arquivo puro (sem servidor/navegador) — usado pelos dois lados.
export type ParcelaPortal = {
  chave: string; rotulo: string; valor: number; vencimento: string | null;
  pago: boolean; pagoEm: string | null; boletoUrl: string | null; origem: 'asaas' | 'contrato';
};

function somarMeses(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1 + n, 1);
  const ultimo = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(d, ultimo));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

type CobrancaAsaas = {
  asaasPaymentId?: string; tipo?: string; parcela?: number | string; valor?: number | string; vencimento?: string;
  pago?: boolean; dataPagamento?: string; invoiceUrl?: string; bankSlipUrl?: string; cancelada?: boolean;
};
export type LeadPagamento = {
  cobrancas_manuais?: CobrancaAsaas[] | null; parcelas_pagas?: Record<string, string> | null;
  valor_entrada?: number | string | null; valor_total?: number | string | null;
  parcelas_detalhe?: { data?: string; valor?: number | string }[] | null;
  parcelas?: string | null; vencimento?: string | null; vencimentos_datas?: string[] | null;
};

export function planoPagamento(lead: LeadPagamento): ParcelaPortal[] {
  // 1) Boletos/Pix gerados no Asaas: fonte mais confiável (status confirmado pelo webhook).
  const cobrancas = (Array.isArray(lead.cobrancas_manuais) ? lead.cobrancas_manuais : []).filter(c => !c.cancelada);
  if (cobrancas.length > 0) {
    return cobrancas
      .map((c, i): ParcelaPortal => ({
        chave: c.asaasPaymentId || `c${i}`,
        rotulo: c.tipo === 'entrada' ? 'Entrada' : c.parcela ? `Parcela ${c.parcela}` : `Cobrança ${i + 1}`,
        valor: Number(c.valor) || 0, vencimento: c.vencimento || null,
        pago: Boolean(c.pago), pagoEm: c.dataPagamento || null,
        boletoUrl: c.pago ? null : (c.invoiceUrl || c.bankSlipUrl || null), origem: 'asaas' as const,
      }))
      .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
  }

  // 2) Sem Asaas: o plano do contrato, com o que a equipe marcou como pago (parcelas_pagas).
  const pagas: Record<string, string> = lead.parcelas_pagas && typeof lead.parcelas_pagas === 'object' ? lead.parcelas_pagas : {};
  const linha = (chave: string, rotulo: string, valor: number, vencimento: string | null): ParcelaPortal => ({
    chave, rotulo, valor, vencimento, pago: Boolean(pagas[chave]), pagoEm: pagas[chave] || null, boletoUrl: null, origem: 'contrato',
  });
  const itens: ParcelaPortal[] = [];
  const entrada = Number(lead.valor_entrada) || 0;
  if (entrada > 0) itens.push(linha('entrada', 'Entrada', entrada, null));

  const detalhe = Array.isArray(lead.parcelas_detalhe) ? lead.parcelas_detalhe : [];
  if (detalhe.length > 0) {
    detalhe.forEach((p, i) => itens.push(linha(`p${i + 1}`, `Parcela ${i + 1}/${detalhe.length}`, Number(p.valor) || 0, p.data || null)));
  } else {
    const qtd = Math.max(1, parseInt(lead.parcelas || '1', 10) || 1);
    const saldo = Math.max(0, (Number(lead.valor_total) || 0) - entrada);
    const datas: string[] = Array.isArray(lead.vencimentos_datas) && lead.vencimentos_datas.length === qtd
      ? lead.vencimentos_datas as string[]
      : lead.vencimento ? Array.from({ length: qtd }, (_, i) => somarMeses(lead.vencimento as string, i)) : [];
    if (saldo > 0) for (let i = 0; i < qtd; i++) {
      itens.push(linha(`p${i + 1}`, qtd === 1 ? (entrada > 0 ? 'Saldo' : 'Pagamento') : `Parcela ${i + 1}/${qtd}`, Math.round((saldo / qtd) * 100) / 100, datas[i] || null));
    }
  }
  // Cláusula do contrato: a última parcela é paga na entrega do trailer.
  if (itens.length > 1) itens[itens.length - 1].rotulo += ' (na entrega)';
  return itens;
}
