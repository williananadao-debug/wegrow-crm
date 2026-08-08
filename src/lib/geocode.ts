export type ParadaGeo = { id: number; nome: string; endereco: string; lat?: number; lng?: number; geocodeStatus?: 'pendente' | 'ok' | 'falhou'; };

// Geocodifica endereço → lat/lng via Nominatim (OpenStreetMap, gratuito, sem API key).
// Respeita o limite de uso deles (~1 req/s) espaçando as chamadas em sequência.
export async function geocodificarParadas(paradas: ParadaGeo[], onProgresso: (paradas: ParadaGeo[]) => void) {
  const resultado = [...paradas];
  for (let i = 0; i < resultado.length; i++) {
    if (resultado[i].lat !== undefined) continue;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(resultado[i].endereco)}`);
      const data = await res.json();
      if (data?.[0]) {
        resultado[i] = { ...resultado[i], lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), geocodeStatus: 'ok' };
      } else {
        resultado[i] = { ...resultado[i], geocodeStatus: 'falhou' };
      }
    } catch {
      resultado[i] = { ...resultado[i], geocodeStatus: 'falhou' };
    }
    onProgresso([...resultado]);
    if (i < resultado.length - 1) await new Promise(r => setTimeout(r, 1100));
  }
  return resultado;
}
