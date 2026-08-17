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

// Contrato v2 (docs/max/spec-api-demais-fm-comercial-v2.md) — campos "sim" em Null?
// vêm sempre presentes na resposta, nunca omitidos e nunca convertidos em 0.
export type DemaisFmRedesSociaisItem = {
  periodo: string; // "YYYY-MM"
  emissora: string; // "107.9" | "104.7" | "101.1" | "REDE"
  escopo: 'emissora' | 'rede';
  plataforma: string; // "Instagram" | "Facebook" | "Instagram Demais News"
  visualizacoes: number | null;
  interacoes: number | null;
  visitas: number | null;
  seguidores: number | null; // não somar entre emissoras — mesma pessoa pode seguir vários perfis
  tipo_dado: 'medido' | 'estimado';
};

export type DemaisFmRedesSociaisTotalRede = {
  periodo: string;
  plataforma: string;
  visualizacoes: number | null;
  interacoes: number | null;
  visitas: number | null;
  emissoras_somadas: number;
};

export type DemaisFmRedesSociaisResposta = {
  dados: DemaisFmRedesSociaisItem[];
  totais_rede: DemaisFmRedesSociaisTotalRede[];
};

// 🔒 Classe "interno" — receita_liquida/receita_bruta/detalhe nunca podem chegar a tela
// de cliente/anunciante/terceiro. Uso restrito à operação comercial interna da rádio
// (mesmo público que já vê a página /midia/aniversarios hoje, com "Uso Interno").
export type DemaisFmAniversarioItem = {
  periodo: string;
  ano: number;
  mes: number;
  emissora: string; // "107.9" | "104.7" | "101.1"
  cidade: string;
  status: 'vendido' | 'nao_vendido' | 'vendido_sem_valor' | 'sem_registro';
  receita_liquida: string | null; // decimal string; "0.00" = confirmado zero, null = sem registro
  receita_bruta: string | null;
  moeda: string;
  detalhe: string | null; // 🔒 nome de anunciante + valor contratado
};

export type DemaisFmAniversariosResposta = {
  classe: 'interno';
  granularidade: 'mensal';
  dados: DemaisFmAniversarioItem[];
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

export function buscarRedesSociais(ano?: number, mes?: number, emissora?: string) {
  const params = new URLSearchParams();
  if (ano) params.set('ano', String(ano));
  if (mes) params.set('mes', String(mes));
  if (emissora) params.set('emissora', emissora);
  const qs = params.toString();
  return chamar<DemaisFmRedesSociaisResposta>(`/redes-sociais${qs ? `?${qs}` : ''}`);
}

// 🔒 Confidencial — só chamar a partir de rota restrita a diretor/gerente.
export function buscarAniversarios(ano?: number, mes?: number) {
  const params = new URLSearchParams();
  if (ano) params.set('ano', String(ano));
  if (mes) params.set('mes', String(mes));
  const qs = params.toString();
  return chamar<DemaisFmAniversariosResposta>(`/aniversarios${qs ? `?${qs}` : ''}`);
}
