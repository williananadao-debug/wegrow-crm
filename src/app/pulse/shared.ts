import { supabase } from '@/lib/supabase';

export type ClienteOpcao = {
  id: number; nome_empresa: string; telefone: string; cnpj?: string;
  inscricao_estadual?: string; email?: string; cidade?: string; endereco?: string;
};

// Gravado em Configurações → Produtos toda vez que o preço de venda muda (compara com
// o valor original carregado na tela antes de salvar) — não é um trigger de banco, é
// feito na aplicação, então só pega mudança feita por ali.
export type HistoricoPreco = { preco_anterior: number; preco_novo: number; data: string };

export type ServicoConfig = {
  id: number; nome: string; preco: number; tipo?: string; unidade?: string;
  estoque?: number | null; imagem_url?: string | null;
  sku?: string | null; preco_custo?: number | null; estoque_minimo?: number | null;
  prazo_fabricacao_dias?: number | null; descricao?: string | null;
  historico_precos?: HistoricoPreco[] | null;
};

// "Nota Fiscal" = item que o sistema criou sozinho ao ler uma NF e não reconheceu no
// catálogo — na prática é sempre matéria-prima/insumo (ninguém revisou ainda o tipo
// certo). Tratar como matéria-prima em qualquer tela que decide o que é vendável
// (Nova Venda), o que entra em ficha técnica (Produção) ou como o Estoque separa as
// duas listas — sem isso, insumo lido de nota (parafuso, produto de limpeza etc.)
// aparecia misturado com produto acabado pronto pra vender.
export const ehMateriaPrima = (s: Pick<ServicoConfig, 'tipo'>) => s.tipo === 'Matéria-prima' || s.tipo === 'Nota Fiscal';

// Sequência fixa de sub-etapas dentro de "Em produção" — não é configurável por produto
// (ficaria MRP completo, fora do escopo do Pulse hoje). Cobre o caso real de fábrica
// (corte → estrutura → pintura → acabamento) sem virar um quadro Kanban por si só.
// Padrão genérico — cada empresa pode ter seu próprio fluxo (ex: Trailer Travel usa
// Chassi → ACM → Elétrica → Hidráulica → Suspensão → Marcenaria, bem diferente de uma
// oficina). Configurável em Configurações → Etapas de Produção, salvo em
// empresas.modulos.pulse_etapas_fabricacao; isso aqui é só o valor de partida quando a
// empresa ainda não personalizou.
export const ETAPAS_FABRICACAO_PADRAO = ['Corte', 'Solda/Estrutura', 'Pintura', 'Montagem/Acabamento'];

// Etapa salva tanto no formato antigo (string simples) quanto no novo (nome + prazo em dias
// pra medir produtividade — configurável em Configurações → Etapas de Produção). As duas
// formas convivem porque empresa que já tinha etapas configuradas antes dessa mudança salvou
// só string[].
export type EtapaFabricacao = string | { nome: string; prazoDias?: number | null };

export function etapasFabricacaoDe(modulos: Record<string, any> | null | undefined): string[] {
  const custom = modulos?.pulse_etapas_fabricacao as EtapaFabricacao[] | undefined;
  if (!Array.isArray(custom) || custom.length === 0) return ETAPAS_FABRICACAO_PADRAO;
  return custom.map(e => typeof e === 'string' ? e : e.nome);
}

// Prazo (em dias) configurado pra cada etapa, pra comparar com o tempo real que uma
// produção específica ficou nela — a métrica de produtividade que a liderança pediu.
export function prazosEtapasFabricacaoDe(modulos: Record<string, any> | null | undefined): Record<string, number> {
  const custom = modulos?.pulse_etapas_fabricacao as EtapaFabricacao[] | undefined;
  const mapa: Record<string, number> = {};
  if (!Array.isArray(custom)) return mapa;
  for (const e of custom) {
    if (typeof e !== 'string' && e.prazoDias != null && e.prazoDias > 0) mapa[e.nome] = e.prazoDias;
  }
  return mapa;
}

// avulso=true: item digitado na hora, fora do catálogo (ex: personalização de um projeto
// sob medida — "teto elétrico extra", "revestimento premium"). servicoId nesse caso é só
// uma chave local negativa pro React, nunca é gravado como FK em lugar nenhum — não
// mexe em estoque/produção, só soma no valor da venda.
//
// configuracoes: extras anexados a ESSE item específico do pedido (ex: trailer sob
// encomenda + "teto elétrico" + "revestimento premium") — cada um soma (ou desconta, se
// valor negativo) uma vez na linha, não multiplica pela quantidade (faz sentido pra
// trailer, sempre vendido em unidade). Diferente do item avulso (que é uma linha própria
// no pedido) — configuração vive DENTRO da linha do produto principal.
export type ConfiguracaoItem = { chave: string; descricao: string; valor: number };
export type ItemCarrinho = {
  servicoId: number; nome: string; quantidade: number; precoUnitario: number; estoqueMax: number | null;
  avulso?: boolean; configuracoes?: ConfiguracaoItem[];
  // Só usado por produto 100% personalizado (avulso, fora do catálogo) — produto de
  // catálogo tem esse prazo no próprio cadastro (servicos.prazo_fabricacao_dias),
  // personalizado não tem de onde puxar, por isso carrega o valor direto na linha.
  prazoFabricacaoDias?: number | null;
  // Descrição/especificações editável na linha — produto de catálogo já vem com a dele
  // (servicos.descricao) e não precisa disso; existe pra produto personalizado e pra
  // quando alguém edita a descrição de um item específico (ex: orçamento reaberto pra
  // ajustar o que está incluso).
  descricao?: string | null;
};

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

export type EmpresaImpressao = { nome?: string | null; logo_url?: string | null; cor_primaria?: string | null };

// Cor da marca sempre precisa de fallback: nem toda empresa configurou cor_primaria
// ainda (campo relativamente novo), e o documento não pode ficar sem nenhuma cor.
const corMarca = (empresaInfo?: EmpresaImpressao) => empresaInfo?.cor_primaria || '#22C55E';

export function imprimirReciboOuOrcamento(alvo: any, unidadeInfo: any, empresaInfo?: EmpresaImpressao) {
  const ehOrcamento = alvo.status === 'orcamento';
  const rotulo = ehOrcamento ? 'Orçamento' : 'Recibo';
  const itens = alvo.itens || [];
  const cor = corMarca(empresaInfo);

  // Orçamento é documento que o cliente recebe e olha antes de decidir — merece
  // identidade visual de verdade (logo, cor da marca, layout de proposta). Recibo é só
  // comprovante de pagamento interno, formato compacto de cupom continua servindo bem.
  if (!ehOrcamento) {
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
        <h3 style="color:${cor}">TOTAL: R$ ${alvo.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
        <p>Pagamento: ${FORMAS_PAGAMENTO[alvo.forma_pagamento] || alvo.forma_pagamento || ''}</p>
        <script>window.onload = function(){ window.print(); }</script>
      </body></html>
    `);
    janela.document.close();
    return;
  }

  const janela = window.open('', '', 'width=860,height=1000');
  if (!janela) return;
  const nomeEmpresa = unidadeInfo?.razao_social || unidadeInfo?.nome || empresaInfo?.nome || '';
  // Cartão por item em vez de tabela simples — orçamento de trailer (produto caro, sob
  // encomenda) precisa mostrar a descrição completa (specs), não só nome/qtd/preço. A
  // foto do produto vira marca d'água atrás do texto: reforça identidade visual sem
  // brigar com a legibilidade da descrição.
  const linhas = itens.map((i: any) => `
    <div style="position:relative;border:1px solid #eee;border-radius:14px;overflow:hidden;margin-bottom:10px;">
      ${i.imagemUrl ? `<div style="position:absolute;inset:0;background-image:url('${i.imagemUrl}');background-size:cover;background-position:center;opacity:0.07;"></div>` : ''}
      <div style="position:relative;padding:16px 20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div style="flex:1;min-width:0;">
            <p style="margin:0;font-size:14px;font-weight:800">${i.servico}</p>
            ${i.descricao ? `<p style="margin:8px 0 0;font-size:11px;color:#555;white-space:pre-line;line-height:1.6">${i.descricao}</p>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <p style="margin:0;font-size:11px;color:#888;white-space:nowrap">${i.quantidade}x R$ ${i.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:900;color:${cor};white-space:nowrap">R$ ${(i.precoUnitario * i.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>
    </div>`
  ).join('');
  janela.document.write(`
    <html><head><title>Orçamento ${formatId(alvo.id)}</title>
      <style>
        /* Sem isso o navegador some com cor de fundo/imagem de fundo na hora de imprimir
           (ou salvar como PDF) — o cabeçalho colorido, a barra do total e a marca d'água
           do produto saem tudo branco no impresso, só a versão em tela fica bonita. */
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        @page { margin: 12mm; }
      </style>
    </head>
    <body style="font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;background:#f5f5f5;color:#1a1a1a;">
      <div style="max-width:760px;margin:0 auto;background:#fff;">
        <div style="background:${cor};padding:32px 40px;display:flex;align-items:center;gap:16px;">
          ${empresaInfo?.logo_url
            ? `<img src="${empresaInfo.logo_url}" alt="" style="height:56px;max-width:160px;object-fit:contain;background:#fff;border-radius:8px;padding:6px" />`
            : `<div style="width:56px;height:56px;border-radius:12px;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#fff;flex-shrink:0">${(nomeEmpresa || 'W')[0].toUpperCase()}</div>`
          }
          <div>
            <p style="margin:0;color:#fff;font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px">${nomeEmpresa}</p>
            ${unidadeInfo?.cnpj ? `<p style="margin:2px 0 0;color:rgba(255,255,255,0.85);font-size:12px">CNPJ ${unidadeInfo.cnpj}</p>` : ''}
          </div>
        </div>

        <div style="padding:32px 40px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;flex-wrap:wrap;gap:16px">
            <div>
              <p style="margin:0;font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px">Orçamento</p>
              <p style="margin:2px 0 0;font-size:24px;font-weight:900;color:${cor}">${formatId(alvo.id)}</p>
            </div>
            <div style="text-align:right">
              <p style="margin:0;font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px">Data</p>
              <p style="margin:2px 0 0;font-size:14px;font-weight:700">${new Date(alvo.created_at || Date.now()).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          <div style="background:#fafafa;border-radius:12px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px">Cliente</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:700">${alvo.empresa}</p>
          </div>

          <div>${linhas}</div>

          <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <div style="min-width:240px">
              <div style="display:flex;justify-content:space-between;padding:12px 20px;background:${cor};border-radius:10px">
                <span style="color:#fff;font-weight:900;text-transform:uppercase;font-size:13px;letter-spacing:0.5px">Total</span>
                <span style="color:#fff;font-weight:900;font-size:18px">R$ ${alvo.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          ${alvo.forma_pagamento ? `<p style="margin:20px 0 0;font-size:13px;color:#666"><b>Forma de pagamento:</b> ${FORMAS_PAGAMENTO[alvo.forma_pagamento] || alvo.forma_pagamento}</p>` : ''}

          <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;font-style:italic">
            Orçamento sem validade fiscal — sujeito a confirmação e disponibilidade no momento do fechamento.
          </p>
        </div>
      </div>
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
      tipo: 'consumo_producao', producao_id: producao.id, lead_id: leadId || null, user_id: userId || null,
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
      tipo: 'producao', producao_id: producao.id, lead_id: leadId || null, user_id: userId || null,
      observacao: `Produzido a partir da ficha técnica`,
    }]);
  }

  return { producaoId: producao.id, custoTotal };
}

export type AditivoItem = { servicoId: number; nome: string; quantidade: number; precoUnitario: number };
export type PulseAditivo = {
  id: number; empresa_id: string; producao_id: number | null; lead_id: number | null;
  itens: AditivoItem[]; valor_adicional: number; motivo: string | null;
  status: 'pendente' | 'aprovado' | 'rejeitado'; solicitado_por: string | null;
  aprovado_por: string | null; aprovado_em: string | null; created_at: string;
};

// Aprova um aditivo (pedido de adicionar item a uma produção já em andamento — ex:
// cliente pede um teto elétrico depois que o trailer já começou a ser fabricado):
// consome a ficha técnica de cada item igual a uma venda normal faria, mas sem criar uma
// produção nova — soma direto na que já existe — e atualiza o valor total da venda
// original. Alçada de quem pode chamar isso é responsabilidade de quem chama (UI só
// mostra o botão de aprovar pra diretor/gerente), não é reforçada aqui.
export async function aprovarAditivo(aditivo: PulseAditivo, empresaId: string, userId?: string | null): Promise<void> {
  if (!aditivo.producao_id) throw new Error('Aditivo sem produção associada.');

  const servicoIds = aditivo.itens.map(i => i.servicoId);
  const [{ data: fichas }, { data: servicosEnvolvidos }, { data: producaoAtual }] = await Promise.all([
    supabase.from('pulse_fichas_tecnicas').select('produto_final_id, servico_id, quantidade_por_unidade').in('produto_final_id', servicoIds),
    supabase.from('servicos').select('*'),
    supabase.from('pulse_producoes').select('custo_total, produto_final_nome').eq('id', aditivo.producao_id).single(),
  ]);

  const servicoPorId = new Map((servicosEnvolvidos || []).map((s: any) => [s.id, s as ServicoConfig]));
  const fichasPorProduto = new Map<number, FichaTecnicaItem[]>();
  for (const f of fichas || []) {
    const lista = fichasPorProduto.get(f.produto_final_id) || [];
    lista.push({ servicoId: f.servico_id, quantidadePorUnidade: f.quantidade_por_unidade });
    fichasPorProduto.set(f.produto_final_id, lista);
  }

  let custoAdicional = 0;

  for (const item of aditivo.itens) {
    const fichaItens = fichasPorProduto.get(item.servicoId) || [];
    if (fichaItens.length > 0) {
      // Item sob encomenda com ficha técnica — consome matéria-prima na produção já
      // existente (não cria pulse_producoes nova, o trailer já está sendo fabricado).
      for (const fi of fichaItens) {
        const materiaPrima = servicoPorId.get(fi.servicoId);
        if (!materiaPrima) continue;
        const qtd = fi.quantidadePorUnidade * item.quantidade;
        const custoUnitario = materiaPrima.preco_custo || 0;
        custoAdicional += qtd * custoUnitario;
        await supabase.from('pulse_producao_itens').insert([{
          producao_id: aditivo.producao_id, servico_id: materiaPrima.id, materia_prima_nome: materiaPrima.nome,
          quantidade: qtd, custo_unitario: custoUnitario, subtotal: qtd * custoUnitario,
        }]);
        const estoqueAtual = materiaPrima.estoque || 0;
        const novoEstoque = Math.max(0, estoqueAtual - qtd);
        await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', materiaPrima.id);
        await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: empresaId, servico_id: materiaPrima.id, quantidade: -(estoqueAtual - novoEstoque),
          tipo: 'consumo_producao', producao_id: aditivo.producao_id, lead_id: aditivo.lead_id, user_id: userId || null,
          observacao: `Aditivo aprovado — ${item.nome}`,
        }]);
        alertarEstoqueBaixoSeCruzou(materiaPrima.id, estoqueAtual, novoEstoque, materiaPrima.estoque_minimo ?? 5);
      }
    } else {
      // Item de estoque pronto (sem ficha técnica) — baixa direto, igual a venda normal.
      const produto = servicoPorId.get(item.servicoId);
      if (produto && produto.estoque !== null && produto.estoque !== undefined) {
        const estoqueAtual = produto.estoque;
        const novoEstoque = Math.max(0, estoqueAtual - item.quantidade);
        await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', produto.id);
        await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: empresaId, servico_id: produto.id, quantidade: -(estoqueAtual - novoEstoque),
          tipo: 'venda', motivo: 'venda', producao_id: aditivo.producao_id, lead_id: aditivo.lead_id, user_id: userId || null,
          observacao: `Aditivo aprovado — ${item.nome}`,
        }]);
        alertarEstoqueBaixoSeCruzou(produto.id, estoqueAtual, novoEstoque, produto.estoque_minimo ?? 5);
      }
    }
  }

  await supabase.from('pulse_producoes').update({
    custo_total: (producaoAtual?.custo_total || 0) + custoAdicional,
  }).eq('id', aditivo.producao_id);

  await supabase.from('pulse_producao_eventos').insert([{
    producao_id: aditivo.producao_id, tipo: 'status', user_id: userId || null,
    texto: `Aditivo aprovado: ${aditivo.itens.map(i => `${i.nome} ×${i.quantidade}`).join(', ')} (+R$ ${aditivo.valor_adicional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
  }]);

  if (aditivo.lead_id) {
    const { data: lead } = await supabase.from('leads').select('itens, valor_total').eq('id', aditivo.lead_id).single();
    if (lead) {
      const itensAtuais = Array.isArray(lead.itens) ? lead.itens : [];
      const novosItens = [...itensAtuais, ...aditivo.itens.map(i => ({ servico: i.nome, quantidade: i.quantidade, precoUnitario: i.precoUnitario }))];
      await supabase.from('leads').update({
        itens: novosItens, valor_total: (lead.valor_total || 0) + aditivo.valor_adicional,
      }).eq('id', aditivo.lead_id);
    }
  }

  await supabase.from('pulse_aditivos').update({
    status: 'aprovado', aprovado_por: userId || null, aprovado_em: new Date().toISOString(),
  }).eq('id', aditivo.id);
}

// Venda fechada no funil do CRM quando a empresa tem Pulse + CRM: a produção e o estoque
// seguem as regras do Pulse (mesma lógica do "pedido" em Nova Venda) — baixa o estoque dos
// itens controlados e abre produção automática pros itens sob encomenda. Idempotente por
// lead: se já existe movimentação de venda pro lead, não faz nada (evita baixa dupla se o
// card for arrastado pra "ganho" mais de uma vez).
export async function processarVendaCrmNoPulse(params: {
  leadId: number;
  itens: { servico: string; quantidade: number }[];
  empresaId: string;
  userId?: string | null;
  vendedorId?: string | null;
}): Promise<{ producoes: { nome: string; ok: boolean }[] }> {
  const { leadId, itens, empresaId, userId, vendedorId } = params;
  const producoes: { nome: string; ok: boolean }[] = [];

  const [{ data: jaProcessado }, { data: servicosData }, { data: fichasData }] = await Promise.all([
    supabase.from('estoque_movimentacoes').select('id').eq('lead_id', leadId).eq('tipo', 'venda').limit(1),
    supabase.from('servicos').select('*'),
    supabase.from('pulse_fichas_tecnicas').select('produto_final_id, servico_id, quantidade_por_unidade'),
  ]);
  if (jaProcessado && jaProcessado.length > 0) return { producoes };

  const servicos = (servicosData || []) as ServicoConfig[];
  const servicoPorId = new Map(servicos.map(s => [s.id, { ...s }]));
  const servicoPorNome = new Map(servicos.map(s => [s.nome, s.id]));
  // Nome no lead pode vir com as configurações entre parênteses ("Trailer (cor azul)").
  const acharId = (nome: string) => servicoPorNome.get(nome) ?? servicoPorNome.get(nome.replace(/\s*\(.*\)\s*$/, ''));

  const fichasPorProduto = new Map<number, FichaTecnicaItem[]>();
  for (const f of fichasData || []) {
    const lista = fichasPorProduto.get(f.produto_final_id) || [];
    lista.push({ servicoId: f.servico_id, quantidadePorUnidade: f.quantidade_por_unidade });
    fichasPorProduto.set(f.produto_final_id, lista);
  }

  for (const item of itens) {
    const id = acharId(item.servico);
    const s = id != null ? servicoPorId.get(id) : undefined;
    if (!s || ehMateriaPrima(s)) continue;

    if (s.estoque !== null && s.estoque !== undefined) {
      const antes = s.estoque;
      const novo = Math.max(0, antes - item.quantidade);
      alertarEstoqueBaixoSeCruzou(s.id, antes, novo, s.estoque_minimo ?? 5);
      await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
      await supabase.from('estoque_movimentacoes').insert([{
        empresa_id: empresaId, servico_id: s.id, quantidade: novo - antes,
        tipo: 'venda', lead_id: leadId, observacao: `Venda CRM — OS ${formatId(leadId)}`, user_id: userId || null,
      }]);
      s.estoque = novo;
      continue;
    }

    // Sob encomenda (sem estoque controlado): abre produção com a ficha técnica.
    const fichaItens = fichasPorProduto.get(s.id) || [];
    try {
      await registrarProducaoAutomatica({
        empresaId, produtoFinal: s, quantidadeProduzida: item.quantidade, fichaItens,
        materiaPrimaPorId: servicoPorId, userId, responsavelId: vendedorId || userId, leadId, status: 'em_producao',
      });
      for (const fi of fichaItens) {
        const mp = servicoPorId.get(fi.servicoId);
        if (mp && mp.estoque !== null && mp.estoque !== undefined) {
          mp.estoque = Math.max(0, mp.estoque - fi.quantidadePorUnidade * item.quantidade);
        }
      }
      producoes.push({ nome: item.servico, ok: true });
    } catch {
      producoes.push({ nome: item.servico, ok: false });
    }
  }
  return { producoes };
}
