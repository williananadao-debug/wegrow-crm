import type { SupabaseClient } from '@supabase/supabase-js';

// Encurtar contrato já ganho. Regra desde 24/11/2026 (pedido da Demais FM): a venda conta o valor
// ATUAL do contrato (valor_total, já reduzido) no mês em que foi ganha, igual ao Pipeline. Nada
// entra no mês em que o cliente pediu a redução. vendas_ajustes continua gravando o histórico
// (quem reduziu, de quanto, motivo), mas não soma mais em meta/ranking/comissão.
// Antes: o mês da venda mantinha o valor original (valor_fechado) e a diferença caía negativa no
// mês do pedido, o que deixava Metas diferente do Pipeline e o mês atual negativo.

// Valor que a venda conta no mês em que foi ganha
export const valorVenda = (l: { valor_total?: unknown; valor_fechado?: unknown }) =>
  Number(l.valor_total) || 0;

const CONTAR_AJUSTES_NO_MES_DO_PEDIDO = false;

export type AjusteVenda = { valor: number; created_at: string; vendedor_id: string | null; vendedor_nome: string | null; unidade: string | null; lead_id: number };

// A redução já está no valor_total da venda (mês em que foi ganha): não há mais ajuste a somar
// por fora. Mantida com a mesma assinatura para quem chama continuar funcionando.
export async function buscarAjustesVenda(
  db: SupabaseClient, empresaId: string, iniIso: string, fimIso: string,
  filtro: { vendedorId?: string | null; unidade?: string | null } = {},
): Promise<AjusteVenda[]> {
  if (!CONTAR_AJUSTES_NO_MES_DO_PEDIDO) return [];
  let q = db.from('vendas_ajustes').select('valor, created_at, vendedor_id, vendedor_nome, unidade, lead_id')
    .eq('empresa_id', empresaId).gte('created_at', iniIso).lt('created_at', fimIso).limit(5000);
  if (filtro.vendedorId) q = q.eq('vendedor_id', filtro.vendedorId);
  if (filtro.unidade) q = q.eq('unidade', filtro.unidade);
  const { data, error } = await q;
  if (error) return [];
  return (data || []).map(a => ({ ...a, valor: Number(a.valor) || 0 }));
}
