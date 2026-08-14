// Cliente server-a-server pro backend "Demais FM Comercial" (Leo/IAlto, Supabase Edge
// Functions) — contrato em spec-api-demais-fm-comercial-v1. Config única via env
// (DEMAIS_FM_API_BASE_URL/DEMAIS_FM_API_KEY), mesmo padrão do YOUTUBE_API_KEY: infra de
// integração de uma emissora só, não por empresa.

export type DemaisFmAudienciaItem = {
  emissora: string; // "107.9" | "104.7" | "101.1" | "REDE"
  ouvintes_por_minuto: number;
  pct_audiencia: number | null;
  tipo_dado: 'estimado' | 'medido';
  fonte: string;
};

export type DemaisFmAudienciaResposta = {
  dados: DemaisFmAudienciaItem[];
  atualizado_em: string;
};

export type DemaisFmSiteItem = {
  periodo: string; // "YYYY-MM"
  visitas: number | null;
  tipo_dado: 'estimado' | 'medido';
};

export type DemaisFmSiteResposta = {
  plataforma: string;
  dados: DemaisFmSiteItem[];
};

export type DemaisFmAppDownloadItem = {
  periodo: string | null;
  escopo: 'mensal' | 'acumulado';
  loja: string; // "Apple" | "Android"
  valor: number;
  unidade: string;
};

export type DemaisFmAppDownloadsResposta = {
  classe: string;
  dados: DemaisFmAppDownloadItem[];
};

export type DemaisFmMonetizacaoItem = {
  periodo: string | null;
  escopo: 'mensal' | 'acumulado';
  valor: string; // decimal em string, ex "1079.11"
  moeda: string;
  fonte: string;
};

export type DemaisFmMonetizacaoResposta = {
  classe: string;
  dados: DemaisFmMonetizacaoItem[];
};

export type DemaisFmErro = {
  erro: { codigo: string; mensagem: string; http_status: number };
};

function configurado() {
  return Boolean(process.env.DEMAIS_FM_API_BASE_URL && process.env.DEMAIS_FM_API_KEY);
}

async function chamar<T>(caminho: string): Promise<T> {
  const baseUrl = process.env.DEMAIS_FM_API_BASE_URL;
  const apiKey = process.env.DEMAIS_FM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('DEMAIS_FM_API_BASE_URL/DEMAIS_FM_API_KEY não configuradas no servidor.');
  }
  const res = await fetch(`${baseUrl}${caminho}`, {
    headers: { 'X-API-Key': apiKey },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    const erro = (json as DemaisFmErro)?.erro;
    throw new Error(erro?.mensagem || `API Demais FM respondeu ${res.status}`);
  }
  return json as T;
}

export const demaisFmApiConfigurada = configurado;

export function buscarAudiencia() {
  return chamar<DemaisFmAudienciaResposta>('/audiencia');
}

export function buscarSiteMensal(ano?: number, mes?: number) {
  const params = ano && mes ? `?ano=${ano}&mes=${mes}` : '';
  return chamar<DemaisFmSiteResposta>(`/site/mensal${params}`);
}

export function buscarAppDownloads() {
  return chamar<DemaisFmAppDownloadsResposta>('/app/downloads');
}

export function buscarMonetizacao() {
  return chamar<DemaisFmMonetizacaoResposta>('/monetizacao');
}
