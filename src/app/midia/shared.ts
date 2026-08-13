export type MidiaMetricasMensais = {
  id: number;
  empresa_id: string;
  ano: number;
  mes: number;
  ouvintes_por_minuto_estimado: number | null;
  site_acessos: number | null;
  youtube_visualizacoes: number | null;
  youtube_observacoes: string | null;
  instagram_demais_news_visualizacoes: number | null;
  instagram_demais_news_interacoes: number | null;
  instagram_demais_news_seguidores: number | null;
  app_downloads_apple_total: number | null;
  app_downloads_android_total: number | null;
  monetizacao_valor: number | null;
};

export type MidiaMetaConfig = {
  id: number;
  empresa_id: string;
  ig_business_account_id: string | null;
  fb_page_id: string | null;
  access_token: string | null;
  token_atualizado_em: string | null;
};

export type InstagramInsightsResposta = {
  ano: number;
  mes: number;
  seguidores: number;
  visualizacoes: number;
  interacoes: number;
  visitasPerfil: number;
};

export const MESES_LABEL = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export const PRACAS = ['101.1', '104.7', '107.9'] as const;
export const PRACA_CIDADE_SEDE: Record<string, string> = {
  '101.1': 'Itaiópolis',
  '104.7': 'Taió',
  '107.9': 'Presidente Getúlio',
};

export type MidiaEmissoraAudiencia = {
  id: number;
  empresa_id: string;
  praca: string;
  ano: number;
  mes: number;
  ouvintes_por_minuto: number | null;
  share_audiencia: number | null;
};

export type MidiaAniversarioMunicipio = {
  id: number;
  empresa_id: string;
  municipio: string;
  uf: string | null;
  praca: string | null;
  dia: number;
  mes: number;
  observacao: string | null;
  ativo: boolean;
};

// Data recorrente (só dia/mês) — calcula quantos dias faltam pra próxima ocorrência,
// já virando o ano quando a data deste ano já passou.
export function diasAteProximaOcorrencia(dia: number, mes: number, hoje = new Date()): number {
  const ano = hoje.getFullYear();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let proxima = new Date(ano, mes - 1, dia);
  if (proxima < hojeSemHora) proxima = new Date(ano + 1, mes - 1, dia);
  return Math.round((proxima.getTime() - hojeSemHora.getTime()) / 86400000);
}

// Lista de cidades atendidas pelas 3 praças da Demais FM, com data de emancipação
// pesquisada (Wikipédia — "Lista de municípios de Santa Catarina por data de criação"
// + fontes oficiais pra Rio Negro/PR). ⚠️ Em alguns municípios a data comemorada
// localmente é a de INSTALAÇÃO, não a da lei de criação (ex.: Taió: lei 30/12/1948,
// instalação 12/02/1949) — vale confirmar com cada prefeitura antes de usar pra vender.
export const SUGESTOES_ANIVERSARIOS_DEMAIS_FM: { municipio: string; uf: string; praca: string; dia: number; mes: number; observacao?: string }[] = [
  { municipio: 'Ibirama', uf: 'SC', praca: '107.9', dia: 17, mes: 2 },
  { municipio: 'José Boiteux', uf: 'SC', praca: '107.9', dia: 26, mes: 4 },
  { municipio: 'Rio do Sul', uf: 'SC', praca: '107.9', dia: 10, mes: 10 },
  { municipio: 'Dona Emma', uf: 'SC', praca: '107.9', dia: 17, mes: 5 },
  { municipio: 'Apiúna', uf: 'SC', praca: '107.9', dia: 4, mes: 1 },
  { municipio: 'Presidente Getúlio', uf: 'SC', praca: '107.9', dia: 30, mes: 12 },
  { municipio: 'Lontras', uf: 'SC', praca: '107.9', dia: 19, mes: 12 },
  { municipio: 'Taió', uf: 'SC', praca: '104.7', dia: 30, mes: 12, observacao: 'Lei de criação 30/12/1948 — instalação foi 12/02/1949, confirmar qual data a prefeitura comemora' },
  { municipio: 'Vitor Meireles', uf: 'SC', praca: '104.7', dia: 26, mes: 4 },
  { municipio: 'Rio do Oeste', uf: 'SC', praca: '104.7', dia: 21, mes: 6 },
  { municipio: 'Santa Cecília', uf: 'SC', praca: '104.7', dia: 21, mes: 6 },
  { municipio: 'Witmarsum', uf: 'SC', praca: '104.7', dia: 17, mes: 5 },
  { municipio: 'Pouso Redondo', uf: 'SC', praca: '104.7', dia: 21, mes: 6 },
  { municipio: 'Braço do Trombudo', uf: 'SC', praca: '104.7', dia: 26, mes: 9 },
  { municipio: 'Mirim Doce', uf: 'SC', praca: '104.7', dia: 26, mes: 9 },
  { municipio: 'Santa Terezinha', uf: 'SC', praca: '104.7 / 101.1', dia: 26, mes: 9, observacao: 'Cobertura sobreposta 104.7/101.1 — evitar dupla contagem' },
  { municipio: 'Rio do Campo', uf: 'SC', praca: '104.7', dia: 20, mes: 12 },
  { municipio: 'Salete', uf: 'SC', praca: '104.7', dia: 20, mes: 12 },
  { municipio: 'Major Vieira', uf: 'SC', praca: '101.1', dia: 23, mes: 12 },
  { municipio: 'Campo Alegre', uf: 'SC', praca: '101.1', dia: 17, mes: 10 },
  { municipio: 'Papanduva', uf: 'SC', praca: '101.1', dia: 30, mes: 12 },
  { municipio: 'Rio Negrinho', uf: 'SC', praca: '101.1', dia: 30, mes: 12 },
  { municipio: 'Monte Castelo', uf: 'SC', praca: '101.1', dia: 23, mes: 4 },
  { municipio: 'Mafra', uf: 'SC', praca: '101.1', dia: 25, mes: 8 },
  { municipio: 'São Bento do Sul', uf: 'SC', praca: '101.1', dia: 21, mes: 5 },
  { municipio: 'Itaiópolis', uf: 'SC', praca: '101.1', dia: 28, mes: 10 },
  { municipio: 'Rio Negro', uf: 'PR', praca: '101.1', dia: 15, mes: 11, observacao: 'Data de instalação/comemorada — decreto de criação foi 02/04/1870' },
];

export const fmtCompacto = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtMoeda = (v: number | null | undefined) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export const fmtNumero = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR');
