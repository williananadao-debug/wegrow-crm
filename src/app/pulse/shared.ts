export type ClienteOpcao = {
  id: number; nome_empresa: string; telefone: string; cnpj?: string;
  inscricao_estadual?: string; email?: string; cidade?: string; endereco?: string;
};

export type ServicoConfig = { id: number; nome: string; preco: number; tipo?: string; unidade?: string; estoque?: number | null; imagem_url?: string | null; };

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
