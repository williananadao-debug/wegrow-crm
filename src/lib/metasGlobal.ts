import type { SupabaseClient } from '@supabase/supabase-js';

// Meta global = soma das metas dos vendedores. Vale só para as rádios novas
// (empresas.meta_global_soma, que nasce true). As que já existiam, como a Demais FM,
// continuam com a meta global digitada à mão.

type LinhaMeta = { user_id: string | null; mes: number | null; ano: number; valor_objetivo: number | string | null };
export type MetaSomada = { mes: number | null; ano: number; valor_objetivo: number };

export async function globalSomaVendedores(db: SupabaseClient, empresaId?: string | null): Promise<boolean> {
  if (!empresaId) return false;
  const { data, error } = await db.from('empresas').select('meta_global_soma').eq('id', empresaId).maybeSingle();
  if (error) return false; // coluna ainda não criada: comportamento antigo
  return data?.meta_global_soma === true;
}

// Linhas de meta de faturamento dos vendedores → meta do ano (mes null) + uma por mês.
// Meta do ano de cada vendedor: a que ele tem salva, ou a soma dos meses dele.
export function somarMetasVendedores(linhas: LinhaMeta[], ano: number): MetaSomada[] {
  const porVendedor = new Map<string, { anual: number; meses: number }>();
  const porMes: Record<number, number> = {};
  for (const l of linhas) {
    if (!l.user_id || l.ano !== ano) continue;
    const v = Number(l.valor_objetivo) || 0;
    const acc = porVendedor.get(l.user_id) || { anual: 0, meses: 0 };
    if (l.mes == null || l.mes === 0) acc.anual = v;
    else { acc.meses += v; porMes[l.mes] = (porMes[l.mes] || 0) + v; }
    porVendedor.set(l.user_id, acc);
  }
  let anual = 0;
  porVendedor.forEach(a => { anual += a.anual > 0 ? a.anual : a.meses; });
  return [
    { mes: null, ano, valor_objetivo: anual },
    ...Object.entries(porMes).map(([mes, valor]) => ({ mes: Number(mes), ano, valor_objetivo: valor })),
  ];
}

export async function buscarMetaGlobalSomada(db: SupabaseClient, empresaId: string, ano: number): Promise<MetaSomada[]> {
  const { data } = await db.from('metas').select('user_id, mes, ano, valor_objetivo')
    .eq('empresa_id', empresaId).eq('ano', ano).eq('tipo', 'faturamento')
    .not('user_id', 'is', null).is('produto', null).is('unidade', null);
  return somarMetasVendedores(data || [], ano);
}
