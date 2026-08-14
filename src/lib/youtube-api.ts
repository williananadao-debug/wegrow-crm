// YouTube Data API v3 — estatísticas públicas do canal (visualizações e inscritos
// TOTAIS/acumulados, não por mês). Números mensais exigem YouTube Analytics API com
// OAuth autorizado pelo dono do canal — fora do escopo desta chave simples.
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export type YoutubeEstatisticasCanal = {
  inscritos: number;
  visualizacoesTotais: number;
  videos: number;
};

export async function buscarEstatisticasCanalYoutube(channelId: string, apiKey: string): Promise<YoutubeEstatisticasCanal> {
  const url = `${YOUTUBE_API_BASE}/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${apiKey}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || `YouTube API respondeu ${res.status}`);
  }
  const item = json.items?.[0];
  if (!item) throw new Error('Canal não encontrado — confira o Channel ID.');
  const stats = item.statistics || {};
  return {
    inscritos: Number(stats.subscriberCount || 0),
    visualizacoesTotais: Number(stats.viewCount || 0),
    videos: Number(stats.videoCount || 0),
  };
}
