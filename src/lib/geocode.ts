export type ParadaGeo = { id: number; nome: string; endereco: string; lat?: number; lng?: number; geocodeStatus?: 'pendente' | 'ok' | 'falhou'; };

async function buscarNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* tenta o fallback abaixo */ }
  return null;
}

// Geocodifica endereço → lat/lng via Nominatim (OpenStreetMap, gratuito, sem API key).
// Respeita o limite de uso deles (~1 req/s) espaçando as chamadas em sequência.
// Se o endereço completo (rua + número) não bater com nada — comum com endereço digitado
// errado ou rua que o OSM não tem mapeada — tenta de novo só com cidade/estado, pra pelo
// menos aproximar o marcador em vez de deixar a parada sem localização nenhuma.
export async function geocodificarParadas(paradas: ParadaGeo[], onProgresso: (paradas: ParadaGeo[]) => void) {
  const resultado = [...paradas];
  for (let i = 0; i < resultado.length; i++) {
    if (resultado[i].lat !== undefined) continue;
    let ponto = await buscarNominatim(resultado[i].endereco);
    if (!ponto) {
      const partes = resultado[i].endereco.split(',').map(p => p.trim()).filter(Boolean);
      const cidadeEstado = partes.slice(-2).join(', ');
      if (cidadeEstado && cidadeEstado !== resultado[i].endereco) {
        await new Promise(r => setTimeout(r, 1100));
        ponto = await buscarNominatim(cidadeEstado);
      }
    }
    resultado[i] = ponto
      ? { ...resultado[i], lat: ponto.lat, lng: ponto.lng, geocodeStatus: 'ok' }
      : { ...resultado[i], geocodeStatus: 'falhou' };
    onProgresso([...resultado]);
    if (i < resultado.length - 1) await new Promise(r => setTimeout(r, 1100));
  }
  return resultado;
}
