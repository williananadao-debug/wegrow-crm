// Cliente da API pública do PNCP (Portal Nacional de Contratações Públicas).
// Confirmado via spike em 2026-08-12: https://pncp.gov.br/api/consulta/v1/... é
// público, sem autenticação, CORS liberado (access-control-allow-origin: *).
// Sem headers de rate-limit expostos — o cron de sync deve ser conservador
// mesmo assim (paginação sequencial, sem paralelismo agressivo).

const PNCP_BASE = 'https://pncp.gov.br/api/consulta/v1';

export type PncpContratacao = {
  numeroControlePNCP: string;
  processo: string;
  objetoCompra: string;
  modalidadeNome: string;
  situacaoCompraNome: string;
  valorTotalEstimado: number | null;
  valorTotalHomologado: number | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  orgaoEntidade: { razaoSocial: string; cnpj: string };
  unidadeOrgao: { ufSigla: string; municipioNome: string };
  linkProcessoEletronico: string | null;
  [key: string]: any;
};

export type PncpBuscaResultado = {
  data: PncpContratacao[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
  empty: boolean;
};

// Só as modalidades mais comuns pra licitação de fornecimento/serviço — lista
// completa fica no manual oficial do PNCP se precisar expandir depois.
export const MODALIDADES_PNCP: Record<number, string> = {
  4: 'Concorrência - Eletrônica',
  6: 'Pregão - Eletrônico',
  7: 'Pregão - Presencial',
  8: 'Dispensa de Licitação',
  9: 'Inexigibilidade',
  12: 'Credenciamento',
};

export function formatarDataPncp(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function buscarContratacoesPncp(opts: {
  dataInicial: string; // YYYYMMDD
  dataFinal: string;   // YYYYMMDD
  modalidade: number;
  uf?: string | null;
  pagina?: number;
  tamanhoPagina?: number;
}): Promise<PncpBuscaResultado> {
  const params = new URLSearchParams({
    dataInicial: opts.dataInicial,
    dataFinal: opts.dataFinal,
    codigoModalidadeContratacao: String(opts.modalidade),
    pagina: String(opts.pagina || 1),
    tamanhoPagina: String(opts.tamanhoPagina || 50),
  });
  if (opts.uf) params.set('uf', opts.uf);

  const res = await fetch(`${PNCP_BASE}/contratacoes/publicacao?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`PNCP respondeu ${res.status} ao buscar contratações`);
  return res.json();
}

// O endpoint de busca não faz full-text search — filtra em memória pelo objeto
// da compra, aplicado depois de buscar por modalidade+UF+data.
export function filtrarPorPalavrasChave(itens: PncpContratacao[], palavrasChave?: string | null): PncpContratacao[] {
  if (!palavrasChave) return itens;
  const termos = palavrasChave.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  if (termos.length === 0) return itens;
  return itens.filter(i => termos.some(t => (i.objetoCompra || '').toLowerCase().includes(t)));
}

// Lookup de detalhe/status por numeroControlePNCP (formato "CNPJ-1-SEQUENCIAL/ANO").
// NÃO testado no spike (só a busca por publicação foi validada ao vivo) — antes
// de ligar o cron de acompanhamento de status, confirmar esse endpoint contra a
// API real (o padrão de URL abaixo segue a convenção documentada no manual do
// PNCP pra consulta de uma compra específica por órgão/ano/sequencial).
export async function detalharContratacaoPncp(numeroControlePNCP: string): Promise<PncpContratacao | null> {
  const match = numeroControlePNCP.match(/^(\d+)-\d+-(\d+)\/(\d{4})$/);
  if (!match) return null;
  const [, cnpj, sequencialStr, ano] = match;
  const sequencial = Number(sequencialStr);
  const res = await fetch(`${PNCP_BASE.replace('/consulta', '')}/orgaos/${cnpj}/compras/${ano}/${sequencial}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}
