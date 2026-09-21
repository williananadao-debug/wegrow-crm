// Cálculos da gestão de estoque (Pulse): necessidade de material pelas vendas em andamento,
// sugestão de compra e curva ABC. Lógica pura — a tela só busca os dados e chama aqui.

export type ServicoEstoque = {
  id: number; nome: string; tipo?: string | null; estoque?: number | null; estoque_minimo?: number | null;
  estoque_maximo?: number | null; prazo_reposicao_dias?: number | null; fornecedor_padrao_id?: number | null;
  preco_custo?: number | null; unidade?: string | null;
};
export type FichaLinha = { produto_final_id: number; servico_id: number; quantidade_por_unidade: number };
export type LeadPipeline = { id: number; empresa: string; etapa: number; status: string; itens: { servico: string; quantidade: number }[] | string | null };

const semParenteses = (n: string) => n.replace(/\s*\(.*\)\s*$/, '');
const norm = (s: string) => s.trim().toLowerCase();

export type NecessidadeMaterial = {
  servico: ServicoEstoque;
  estoque: number; minimo: number;
  provavel: number;          // demanda das vendas em negociação/aprovação (etapa >= etapaProvavel)
  possivel: number;          // demanda das propostas enviadas (etapa anterior à provável)
  sugerido: number;          // quanto comprar agora
  motivo: 'venda' | 'minimo' | 'ok';
  vendas: { leadId: number; cliente: string; produto: string; quantidade: number }[];
};

// Necessidade de matéria-prima = Σ (quantidade vendida do produto final × ficha técnica),
// sobre os leads ABERTOS do funil. Etapa >= etapaProvavel conta como "provável" (compra
// deve ser coberta); as anteriores só como "possível" (informativo, não entra na sugestão).
export function calcularNecessidades(params: {
  servicos: ServicoEstoque[]; fichas: FichaLinha[]; leads: LeadPipeline[]; etapaProvavel?: number;
}): NecessidadeMaterial[] {
  const { servicos, fichas, leads } = params;
  const etapaProvavel = params.etapaProvavel ?? 3;
  const porNome = new Map(servicos.map(s => [norm(s.nome), s]));
  const fichaPorProduto = new Map<number, FichaLinha[]>();
  fichas.forEach(f => { const l = fichaPorProduto.get(f.produto_final_id) || []; l.push(f); fichaPorProduto.set(f.produto_final_id, l); });

  const acc = new Map<number, { provavel: number; possivel: number; vendas: NecessidadeMaterial['vendas'] }>();
  for (const lead of leads) {
    if (lead.status !== 'aberto') continue;
    let itens: { servico: string; quantidade: number }[] = [];
    try { itens = typeof lead.itens === 'string' ? JSON.parse(lead.itens) : (lead.itens || []); } catch { itens = []; }
    for (const it of itens) {
      const produto = porNome.get(norm(it.servico)) || porNome.get(norm(semParenteses(it.servico)));
      if (!produto) continue;
      for (const f of fichaPorProduto.get(produto.id) || []) {
        const qtd = f.quantidade_por_unidade * (Number(it.quantidade) || 1);
        const a = acc.get(f.servico_id) || { provavel: 0, possivel: 0, vendas: [] };
        if (lead.etapa >= etapaProvavel) a.provavel += qtd; else a.possivel += qtd;
        a.vendas.push({ leadId: lead.id, cliente: lead.empresa, produto: produto.nome, quantidade: qtd });
        acc.set(f.servico_id, a);
      }
    }
  }

  const resultado: NecessidadeMaterial[] = [];
  for (const s of servicos) {
    if (s.estoque === null || s.estoque === undefined) continue; // só estoque controlado
    const a = acc.get(s.id) || { provavel: 0, possivel: 0, vendas: [] };
    const estoque = Number(s.estoque) || 0;
    const minimo = Number(s.estoque_minimo ?? 5);
    const maximo = s.estoque_maximo != null ? Number(s.estoque_maximo) : null;

    const alvo = a.provavel + minimo;
    let sugerido = Math.max(0, alvo - estoque);
    // não estoura o máximo, exceto pra cobrir a falta real das vendas prováveis
    if (maximo != null) sugerido = Math.max(Math.max(0, a.provavel - estoque), Math.min(sugerido, Math.max(0, maximo - estoque)));
    sugerido = Math.ceil(sugerido);

    const motivo: NecessidadeMaterial['motivo'] = sugerido === 0 ? 'ok' : (estoque < a.provavel + minimo && a.provavel > 0 ? 'venda' : 'minimo');
    resultado.push({ servico: s, estoque, minimo, provavel: a.provavel, possivel: a.possivel, sugerido, motivo, vendas: a.vendas });
  }
  return resultado.sort((a, b) => (b.sugerido > 0 ? 1 : 0) - (a.sugerido > 0 ? 1 : 0) || a.servico.nome.localeCompare(b.servico.nome, 'pt-BR', { sensitivity: 'base', numeric: true }));
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
