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

export const fmtCompacto = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtMoeda = (v: number | null | undefined) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export const fmtNumero = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR');
