import { supabase } from '@/lib/supabase';

export type ClienteOpcao = {
  id: number; nome_empresa: string; telefone: string; cnpj?: string;
  inscricao_estadual?: string; email?: string; cidade?: string; endereco?: string;
};

export type ServicoConfig = {
  id: number; nome: string; preco: number; tipo?: string; unidade?: string;
  estoque?: number | null; imagem_url?: string | null;
  sku?: string | null; preco_custo?: number | null; estoque_minimo?: number | null;
  prazo_fabricacao_dias?: number | null;
};

// Sequência fixa de sub-etapas dentro de "Em produção" — não é configurável por produto
// (ficaria MRP completo, fora do escopo do Pulse hoje). Cobre o caso real de fábrica
// (corte → estrutura → pintura → acabamento) sem virar um quadro Kanban por si só.
export const ETAPAS_FABRICACAO = ['Corte', 'Solda/Estrutura', 'Pintura', 'Montagem/Acabamento'];

export type ItemCarrinho = { servicoId: number; nome: string; quantidade: number; precoUnitario: number; estoqueMax: number | null; };

export type VendaPulse = {
  id: number; empresa: string; valor_total: number; created_at: string; forma_pagamento?: string | null;
  cnpj?: string | null; nfse_invoice_id?: string | null; nfse_pdf_url?: string | null; user_id?: string | null;
  status: string; itens?: { servico: string; quantidade: number; precoUnitario: number }[];
  estornado_em?: string | null; estornado_motivo?: string | null;
};

export type RankingItem = { id: string; nome: string; count: number; total: number };

export const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto', transferencia: 'Transferência',
};

export const formatId = (id: number) => `LD-${String(id).padStart(4, '0')}`;

export const getLocalYYYYMMDD = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatCompact = (num: number) => num >= 1000 ? (num / 1000).toFixed(1).replace('.0', '') + 'k' : (num % 1 === 0 ? num.toString() : num.toFixed(2));

export function imprimirReciboOuOrcamento(alvo: any, unidadeInfo: any) {
  const ehOrcamento = alvo.status === 'orcamento';
  const rotulo = ehOrcamento ? 'Orçamento' : 'Recibo';
  const itens = alvo.itens || [];
  const janela = window.open('', '', 'width=420,height=600');
  if (!janela) return;
  const linhas = itens.map((i: any) =>
    `<tr><td style="padding:4px 0">${i.quantidade}x ${i.servico}</td><td style="text-align:right;padding:4px 0">R$ ${(i.precoUnitario * i.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`
  ).join('');
  janela.document.write(`
    <html><head><title>${rotulo} ${formatId(alvo.id)}</title></head>
    <body style="font-family:monospace;font-size:12px;padding:16px;max-width:360px;margin:0 auto;">
      <h2 style="text-align:center;margin:0 0 4px;">${unidadeInfo?.razao_social || unidadeInfo?.nome || ''}</h2>
      ${unidadeInfo?.cnpj ? `<p style="text-align:center;margin:0 0 12px;">CNPJ ${unidadeInfo.cnpj}</p>` : ''}
      <hr/>
      <p><b>${rotulo}:</b> ${formatId(alvo.id)}<br/><b>Cliente:</b> ${alvo.empresa}<br/><b>Data:</b> ${new Date(alvo.created_at || Date.now()).toLocaleString('pt-BR')}</p>
      <hr/>
      <table style="width:100%;border-collapse:collapse;">${linhas}</table>
      <hr/>
      <h3>TOTAL: R$ ${alvo.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
      <p>Pagamento: ${FORMAS_PAGAMENTO[alvo.forma_pagamento] || alvo.forma_pagamento || ''}</p>
      ${ehOrcamento ? '<p style="text-align:center;margin-top:12px;font-style:italic;">Orçamento sem validade fiscal — sujeito a confirmação.</p>' : ''}
      <script>window.onload = function(){ window.print(); }</script>
    </body></html>
  `);
  janela.document.close();
}

// Dispara só na transição de "acima do mínimo" pra "no mínimo ou abaixo" — não manda um
// e-mail novo a cada venda enquanto o produto já está baixo, só quando cruza a linha.
export async function alertarEstoqueBaixoSeCruzou(servicoId: number, antes: number, depois: number, minimo: number) {
  if (!(antes > minimo && depois <= minimo)) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    fetch('/api/pulse/alerta-estoque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ servicoId }),
    }).catch(() => {});
  } catch {}
}

export type FichaTecnicaItem = { servicoId: number; quantidadePorUnidade: number };

// Registra 1 produção consumindo a ficha técnica do produto (matéria-prima × quantidade
// produzida) — usado tanto pelo botão manual "Registrar produção" quanto pelo gatilho
// automático em Nova Venda, pra nunca duplicar a lógica de baixa de estoque/kardex entre
// os dois lugares.
export async function registrarProducaoAutomatica(params: {
  empresaId: string;
  produtoFinal: ServicoConfig;
  quantidadeProduzida: number;
  fichaItens: FichaTecnicaItem[];
  materiaPrimaPorId: Map<number, ServicoConfig>;
  userId?: string | null;
  responsavelId?: string | null;
  previsaoEntrega?: string | null;
  leadId?: number | null;
  status?: 'em_producao' | 'concluida' | 'entregue';
}): Promise<{ producaoId: number; custoTotal: number }> {
  const { empresaId, produtoFinal, quantidadeProduzida, fichaItens, materiaPrimaPorId, userId, responsavelId, previsaoEntrega, leadId, status } = params;

  let custoTotal = 0;
  const consumos = fichaItens.map(fi => {
    const materiaPrima = materiaPrimaPorId.get(fi.servicoId);
    const qtd = fi.quantidadePorUnidade * quantidadeProduzida;
    const custoUnitario = materiaPrima?.preco_custo || 0;
    custoTotal += qtd * custoUnitario;
    return { materiaPrima, qtd, custoUnitario };
  });

  // Sem previsão informada, usa o prazo padrão de fabricação cadastrado na ficha técnica
  // do produto — venda fechada já nasce com data estimada, sem precisar digitar na hora.
  let previsaoFinal = previsaoEntrega || null;
  if (!previsaoFinal && produtoFinal.prazo_fabricacao_dias) {
    const data = new Date();
    data.setDate(data.getDate() + produtoFinal.prazo_fabricacao_dias);
    previsaoFinal = data.toISOString().split('T')[0];
  }

  const { data: producao, error: errProd } = await supabase.from('pulse_producoes').insert([{
    empresa_id: empresaId, produto_final_id: produtoFinal.id, produto_final_nome: produtoFinal.nome,
    quantidade_produzida: quantidadeProduzida, custo_total: custoTotal, user_id: userId || null,
    previsao_entrega: previsaoFinal, responsavel_id: responsavelId || userId || null,
    lead_id: leadId || null, status: status || 'em_producao',
  }]).select('id').single();
  if (errProd || !producao) throw new Error(errProd?.message || 'Erro ao registrar produção.');

  await supabase.from('pulse_producao_eventos').insert([{
    producao_id: producao.id, tipo: 'status',
    texto: leadId ? 'Produção iniciada automaticamente pela venda.' : 'Produção registrada manualmente.',
    user_id: userId || null,
  }]);

  for (const c of consumos) {
    if (!c.materiaPrima) continue;
    await supabase.from('pulse_producao_itens').insert([{
      producao_id: producao.id, servico_id: c.materiaPrima.id, materia_prima_nome: c.materiaPrima.nome,
      quantidade: c.qtd, custo_unitario: c.custoUnitario, subtotal: c.qtd * c.custoUnitario,
    }]);
    const estoqueAtual = c.materiaPrima.estoque || 0;
    const novoEstoque = Math.max(0, estoqueAtual - c.qtd);
    await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', c.materiaPrima.id);
    await supabase.from('estoque_movimentacoes').insert([{
      empresa_id: empresaId, servico_id: c.materiaPrima.id, quantidade: -(estoqueAtual - novoEstoque),
      tipo: 'consumo_producao', producao_id: producao.id, user_id: userId || null,
      observacao: `Consumido na produção de ${produtoFinal.nome}`,
    }]);
    alertarEstoqueBaixoSeCruzou(c.materiaPrima.id, estoqueAtual, novoEstoque, c.materiaPrima.estoque_minimo ?? 5);
  }

  // Produto final não precisa ter estoque controlado — fábrica que produz sob encomenda
  // (ex: trailer) não guarda produto pronto parado, só registra o histórico/custo.
  const controlaEstoque = produtoFinal.estoque !== null && produtoFinal.estoque !== undefined;
  const novoCustoUnitario = quantidadeProduzida > 0 ? custoTotal / quantidadeProduzida : 0;
  const patch: any = { preco_custo: novoCustoUnitario };
  if (controlaEstoque) patch.estoque = (produtoFinal.estoque || 0) + quantidadeProduzida;
  await supabase.from('servicos').update(patch).eq('id', produtoFinal.id);
  if (controlaEstoque) {
    await supabase.from('estoque_movimentacoes').insert([{
      empresa_id: empresaId, servico_id: produtoFinal.id, quantidade: quantidadeProduzida,
      tipo: 'producao', producao_id: producao.id, user_id: userId || null,
      observacao: `Produzido a partir da ficha técnica`,
    }]);
  }

  return { producaoId: producao.id, custoTotal };
}
