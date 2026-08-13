// Cliente pra Instagram Graph API (Meta) — conta Business/Creator vinculada a uma
// Página do Facebook. Usa só métricas de nível de conta, estáveis nas versões recentes
// da API (v19+): "views" substituiu "impressions", que a Meta descontinuou.
// Doc: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/insights
const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type InstagramInsightsMes = {
  seguidores: number;
  visualizacoes: number;
  interacoes: number;
  visitasPerfil: number;
};

async function fetchGraph(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH_BASE}${path}?${qs}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json?.error?.message || `Meta Graph API respondeu ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function somaValoresTotalValue(insightsData: any[], nomeMetrica: string): number {
  const item = insightsData.find((d: any) => d.name === nomeMetrica);
  return item?.total_value?.value ?? 0;
}

// since/until em formato YYYY-MM-DD, cobrindo o mês inteiro que se quer medir.
export async function buscarInsightsInstagram(
  igBusinessAccountId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<InstagramInsightsMes> {
  const [perfil, insights] = await Promise.all([
    fetchGraph(`/${igBusinessAccountId}`, {
      fields: 'followers_count',
      access_token: accessToken,
    }),
    fetchGraph(`/${igBusinessAccountId}/insights`, {
      metric: 'views,total_interactions,profile_views',
      metric_type: 'total_value',
      period: 'day',
      since,
      until,
      access_token: accessToken,
    }),
  ]);

  const dados = insights.data || [];
  return {
    seguidores: perfil.followers_count ?? 0,
    visualizacoes: somaValoresTotalValue(dados, 'views'),
    interacoes: somaValoresTotalValue(dados, 'total_interactions'),
    visitasPerfil: somaValoresTotalValue(dados, 'profile_views'),
  };
}
