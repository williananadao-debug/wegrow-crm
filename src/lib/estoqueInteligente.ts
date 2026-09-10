// Reposição inteligente: em vez de só avisar quando o estoque já cruzou um número fixo
// (estoque_minimo, configurado uma vez e esquecido), calcula o RITMO real de consumo dos
// últimos dias e estima em quantos dias o produto vai zerar — daí sim avisa com
// antecedência suficiente pra repor sem parar a produção. Complementa o alerta de mínimo
// fixo (alertarEstoqueBaixoSeCruzou em shared.ts), não substitui.

export type MovimentoConsumo = { servico_id: number; quantidade: number; created_at: string };
export type ProdutoParaReposicao = {
  id: number; nome: string; estoque?: number | null; prazo_fabricacao_dias?: number | null;
};

export type AlertaReposicao = {
  servicoId: number; nome: string; estoqueAtual: number;
  consumoDiario: number; diasRestantes: number; limiarDias: number;
};

const JANELA_DIAS = 30; // consumo recente o bastante pra refletir ritmo atual, longo o bastante pra não reagir a um pico de 1 dia só
const LIMIAR_PADRAO_DIAS = 14; // sem prazo de fabricação configurado no produto: 2 semanas de antecedência é um padrão seguro pra qualquer insumo comprado de fornecedor

// Recebe o catálogo (produtos com estoque controlado) e as movimentações de saída dos
// últimos JANELA_DIAS — devolve só os produtos que vão zerar antes do próprio prazo de
// reposição (prazo_fabricacao_dias do produto, ou o padrão de 14 dias na falta dele).
export function calcularAlertasReposicao(
  produtos: ProdutoParaReposicao[], movimentosSaida: MovimentoConsumo[]
): AlertaReposicao[] {
  const consumoPorServico = new Map<number, number>();
  for (const m of movimentosSaida) {
    if (m.quantidade >= 0) continue; // essa lista já deveria vir só com saída, mas não confia — soma só o que é saída de fato
    consumoPorServico.set(m.servico_id, (consumoPorServico.get(m.servico_id) || 0) + Math.abs(m.quantidade));
  }

  const alertas: AlertaReposicao[] = [];
  for (const produto of produtos) {
    if (produto.estoque === null || produto.estoque === undefined) continue; // sem controle de estoque nesse produto, nada a calcular
    const consumidoNaJanela = consumoPorServico.get(produto.id) || 0;
    if (consumidoNaJanela <= 0) continue; // sem histórico de saída recente, não dá pra estimar ritmo — fica só no alerta de mínimo fixo
    const consumoDiario = consumidoNaJanela / JANELA_DIAS;
    const diasRestantes = produto.estoque / consumoDiario;
    const limiarDias = produto.prazo_fabricacao_dias && produto.prazo_fabricacao_dias > 0 ? produto.prazo_fabricacao_dias : LIMIAR_PADRAO_DIAS;
    if (diasRestantes <= limiarDias) {
      alertas.push({ servicoId: produto.id, nome: produto.nome, estoqueAtual: produto.estoque, consumoDiario, diasRestantes, limiarDias });
    }
  }
  return alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}
