// OAuth do Google + YouTube Analytics API — dados mensais reais (a Data API pública só
// dá total histórico do canal, não quebra por mês; isso aqui exige autorização do dono
// do canal via OAuth, guardada como refresh_token em midia_meta_config).
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';

export function urlAutorizacaoGoogle(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function trocarCodePorTokens(code: string, redirectUri: string): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Erro ao trocar code por token.');
  return json;
}

async function renovarAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Erro ao renovar token do Google.');
  return json.access_token;
}

function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

export async function buscarVisualizacoesMensaisYoutube(refreshToken: string, ano: number, mes: number): Promise<number> {
  const accessToken = await renovarAccessToken(refreshToken);
  const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`;
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views',
  });
  const res = await fetch(`${YOUTUBE_ANALYTICS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `YouTube Analytics respondeu ${res.status}`);
  return Number(json.rows?.[0]?.[0] || 0);
}
