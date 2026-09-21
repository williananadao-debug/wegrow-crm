// Cálculos da gestão de estoque (Pulse): sugestão de compra pelo consumo real e curva ABC. Lógica pura — a tela só busca os dados e chama aqui.

export type ServicoEstoque = {
  id: number; nome: string; tipo?: string | null; estoque?: number | null; estoque_minimo?: number | null;
  estoque_maximo?: number | null; prazo_reposicao_dias?: number | null; fornecedor_padrao_id?: number | null;
  preco_custo?: number | null; unidade?: string | null;
};
export type MovimentoSaida = { servico_id: number; quantidade: number; tipo?: string | null; created_at: string };

const JANELA_CONSUMO_DIAS = 60;   // janela do ritmo de consumo
const COBERTURA_EXTRA_DIAS = 30;  // sem estoque máximo: compra pra cobrir prazo de reposição + 30 dias
const PRAZO_PADRAO_DIAS = 14;

export type SugestaoCompra = {
  servico: ServicoEstoque;
  estoque: number; minimo: number;
  consumoDiario: number;          // média por dia nos últimos 60 dias
  diasRestantes: number | null;   // estoque ÷ consumo diário (null = sem consumo)
  prazoDias: number;              // prazo de reposição usado
  pontoPedido: number;            // consumo durante o prazo + mínimo
  sugerido: number;               // quanto comprar agora
  motivo: 'zerado' | 'abaixo_minimo' | 'vai_faltar' | 'ok';
};

// Reposição pelo CONSUMO REAL (não depende de ficha técnica): compra quando o estoque cai até o
// ponto de pedido = (consumo diário × prazo de reposição) + estoque mínimo. A quantidade leva
// o estoque até o máximo cadastrado; sem máximo, cobre o prazo + 30 dias de consumo (e nunca
// menos que o mínimo).
export function calcularSugestoesCompra(params: { servicos: ServicoEstoque[]; movimentosSaida: MovimentoSaida[]; agora?: number }): SugestaoCompra[] {
  const agora = params.agora ?? Date.now();
  const desde = agora - JANELA_CONSUMO_DIAS * 86400000;
  const consumo = new Map<number, number>();
  for (const m of params.movimentosSaida) {
    if (m.quantidade >= 0 || m.tipo === 'estorno') continue;
    if (new Date(m.created_at).getTime() < desde) continue;
    consumo.set(m.servico_id, (consumo.get(m.servico_id) || 0) + Math.abs(m.quantidade));
  }

  const out: SugestaoCompra[] = [];
  for (const s of params.servicos) {
    if (s.estoque === null || s.estoque === undefined) continue;
    const estoque = Number(s.estoque) || 0;
    const minimo = Number(s.estoque_minimo ?? 5);
    const consumoDiario = (consumo.get(s.id) || 0) / JANELA_CONSUMO_DIAS;
    const prazoDias = s.prazo_reposicao_dias && s.prazo_reposicao_dias > 0 ? s.prazo_reposicao_dias : PRAZO_PADRAO_DIAS;
    const pontoPedido = consumoDiario * prazoDias + minimo;
    const maximo = s.estoque_maximo != null ? Number(s.estoque_maximo) : null;
    const alvo = maximo ?? Math.max(minimo, minimo + consumoDiario * (prazoDias + COBERTURA_EXTRA_DIAS));

    let sugerido = 0;
    let motivo: SugestaoCompra['motivo'] = 'ok';
    if (estoque <= 0) motivo = 'zerado';
    else if (estoque <= minimo) motivo = 'abaixo_minimo';
    else if (estoque <= pontoPedido) motivo = 'vai_faltar';
    if (motivo !== 'ok') sugerido = Math.max(1, Math.ceil(alvo - estoque));

    out.push({
      servico: s, estoque, minimo, consumoDiario, diasRestantes: consumoDiario > 0 ? estoque / consumoDiario : null,
      prazoDias, pontoPedido, sugerido, motivo,
    });
  }
  const peso = { zerado: 0, abaixo_minimo: 1, vai_faltar: 2, ok: 3 } as const;
  return out.sort((a, b) => peso[a.motivo] - peso[b.motivo] || a.servico.nome.localeCompare(b.servico.nome, 'pt-BR', { sensitivity: 'base', numeric: true }));
}

// ---------- Curva ABC (valor consumido no período) ----------
export type LinhaABC = { servicoId: number; nome: string; valor: number; percentual: number; acumulado: number; classe: 'A' | 'B' | 'C' };

export function curvaABC(itens: { servicoId: number; nome: string; valor: number }[]): LinhaABC[] {
  const ordenado = itens.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = ordenado.reduce((s, i) => s + i.valor, 0);
  if (total <= 0) return [];
  let acum = 0;
  return ordenado.map(i => {
    const anterior = acum;
    acum += i.valor;
    // classe pelo acumulado ANTES do item: o item que cruza 80% ainda é A
    const classe: 'A' | 'B' | 'C' = anterior / total < 0.8 ? 'A' : anterior / total < 0.95 ? 'B' : 'C';
    return { servicoId: i.servicoId, nome: i.nome, valor: i.valor, percentual: (i.valor / total) * 100, acumulado: (acum / total) * 100, classe };
  });
}
