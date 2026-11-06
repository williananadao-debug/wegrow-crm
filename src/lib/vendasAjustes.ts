import type { SupabaseClient } from '@supabase/supabase-js';

// Encurtar contrato já ganho (migration 20261106120000_vendas_ajustes). A venda passa a ter o
// contrato novo, mas o mês em que foi ganha continua contando o valor original
// (leads.valor_fechado) e a diferença entra como ajuste negativo (vendas_ajustes) no mês em que o
// cliente pediu, no nome do vendedor da venda. Quem soma vendas pra meta, ranking ou comissão usa
// valorVenda() nos leads e soma os ajustes do período por fora.

// Valor que a venda conta no mês em que foi ganha
export const valorVenda = (l: { valor_total?: unknown; valor_fechado?: unknown }) =>
  Number(l.valor_fechado ?? l.valor_total) || 0;

export type AjusteVenda = { valor: number; created_at: string; vendedor_id: string | null; vendedor_nome: string | null; unidade: string | null; lead_id: number };

// Ajustes registrados entre ini (inclusive) e fim (exclusive). Sem a tabela (antes da migration)
// ou com erro, devolve vazio: a soma fica como era antes.
export async function buscarAjustesVenda(
  db: SupabaseClient, empresaId: string, iniIso: string, fimIso: string,
  filtro: { vendedorId?: string | null; unidade?: string | null } = {},
): Promise<AjusteVenda[]> {
  let q = db.from('vendas_ajustes').select('valor, created_at, vendedor_id, vendedor_nome, unidade, lead_id')
    .eq('empresa_id', empresaId).gte('created_at', iniIso).lt('created_at', fimIso).limit(5000);
  if (filtro.vendedorId) q = q.eq('vendedor_id', filtro.vendedorId);
  if (filtro.unidade) q = q.eq('unidade', filtro.unidade);
  const { data, error } = await q;
  if (error) return [];
  return (data || []).map(a => ({ ...a, valor: Number(a.valor) || 0 }));
}
