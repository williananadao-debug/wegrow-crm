// Cliente da API pública do PNCP (Portal Nacional de Contratações Públicas).
// Confirmado via spike em 2026-08-12: https://pncp.gov.br/api/consulta/v1/... é
// público, sem autenticação, CORS liberado (access-control-allow-origin: *).
// Sem headers de rate-limit expostos — o cron de sync deve ser conservador
// mesmo assim (paginação sequencial, sem paralelismo agressivo).
//
// A API é instável na prática: confirmado ao vivo em 2026-08-12 (fora do spike
// inicial) que a mesma requisição, sem nenhuma mudança de parâmetro, alterna
// entre 200, 500, 502 e 503 em questão de segundos e volta sozinha. Todo fetch
// pro PNCP passa por retry com backoff curto — não é opcional.

const PNCP_BASE = 'https://pncp.gov.br/api/consulta/v1';

async function fetchComRetryPncp(url: string, tentativas = 5): Promise<Response> {
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return res;
      // 5xx é o padrão de instabilidade observado — vale tentar de novo.
      // 4xx é erro de parâmetro nosso, não adianta repetir.
      if (res.status < 500) return res;
      ultimoErro = new Error(`PNCP respondeu ${res.status}`);
    } catch (err) {
      ultimoErro = err; // erro de rede/timeout — também vale retry
    }
    if (i < tentativas - 1) {
      await new Promise(r => setTimeout(r, Math.min(600 * Math.pow(1.8, i), 5000))); // 600ms, 1.1s, 1.9s, 3.5s
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('Falha ao conectar no PNCP após retries.');
}

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
  // Tela interativa precisa responder rápido (usuário esperando) — melhor falhar
  // cedo e deixar clicar "tentar de novo" do que segurar a requisição perto do
  // limite da plataforma. O cron em background pode ser bem mais paciente.
  tentativas?: number;
}): Promise<PncpBuscaResultado> {
  const params = new URLSearchParams({
    dataInicial: opts.dataInicial,
    dataFinal: opts.dataFinal,
    codigoModalidadeContratacao: String(opts.modalidade),
    pagina: String(opts.pagina || 1),
    tamanhoPagina: String(opts.tamanhoPagina || 50),
  });
  if (opts.uf) params.set('uf', opts.uf);

  const res = await fetchComRetryPncp(`${PNCP_BASE}/contratacoes/publicacao?${params.toString()}`, opts.tentativas);
  if (!res.ok) throw new Error(`PNCP respondeu ${res.status} ao buscar contratações (depois de retry)`);
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
  const res = await fetchComRetryPncp(`${PNCP_BASE.replace('/consulta', '')}/orgaos/${cnpj}/compras/${ano}/${sequencial}`);
  if (!res.ok) return null;
  return res.json();
}
