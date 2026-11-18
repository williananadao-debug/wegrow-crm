// Análise de trajeto no navegador (os pontos de um dia já vêm carregados para o mapa).
export type Ponto = { lat: number; lng: number; velocidade?: number | null; registrado_em?: string };

export type Parada = { lat: number; lng: number; ini: string; fim: string; minutos: number };
export type Viagem = { ini: string; fim: string; km: number; minutos: number; velMax: number; iIni: number; iFim: number };

const PARADO_KMH = 3;
const PARADA_MIN = 3;        // parada só conta a partir de 3 min
const BURACO_MIN = 5;        // sem pontos por 5+ min sem sair do lugar = parado (aparelho economiza envio)
const BURACO_DIST_KM = 0.2;

export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const t = (p: Ponto) => (p.registrado_em ? new Date(p.registrado_em).getTime() : 0);

export function analisarTrajeto(p: Ponto[]) {
  let km = 0, velMax = 0, movMs = 0;
  // Trecho i (de p[i-1] a p[i]) parado ou andando.
  const parado: boolean[] = [false];
  for (let i = 1; i < p.length; i++) {
    const d = distKm(p[i - 1], p[i]);
    const dt = t(p[i]) - t(p[i - 1]);
    const v0 = Number(p[i - 1].velocidade || 0), v1 = Number(p[i].velocidade || 0);
    velMax = Math.max(velMax, v1);
    const ehParado = (v0 <= PARADO_KMH && v1 <= PARADO_KMH && d < 0.05) || (dt > BURACO_MIN * 60000 && d < BURACO_DIST_KM);
    parado.push(ehParado);
    if (!ehParado) { km += d; movMs += Math.max(0, dt); }
  }

  const paradas: Parada[] = [];
  const viagens: Viagem[] = [];
  let i = 1;
  let inicioViagem = 0;
  while (i < p.length) {
    if (!parado[i]) { i++; continue; }
    const a = i - 1;
    while (i < p.length && parado[i]) i++;
    const b = i - 1;
    const min = (t(p[b]) - t(p[a])) / 60000;
    if (min >= PARADA_MIN) {
      if (a > inicioViagem) viagens.push(fecharViagem(p, inicioViagem, a));
      paradas.push({ lat: p[a].lat, lng: p[a].lng, ini: p[a].registrado_em!, fim: p[b].registrado_em!, minutos: Math.round(min) });
      inicioViagem = b;
    }
  }
  if (p.length > 1 && p.length - 1 > inicioViagem) viagens.push(fecharViagem(p, inicioViagem, p.length - 1));

  return { km, velMax, minutosMovimento: Math.round(movMs / 60000), paradas, viagens: viagens.filter(v => v.km >= 0.1) };
}

function fecharViagem(p: Ponto[], a: number, b: number): Viagem {
  let km = 0, velMax = 0;
  for (let i = a + 1; i <= b; i++) { km += distKm(p[i - 1], p[i]); velMax = Math.max(velMax, Number(p[i].velocidade || 0)); }
  return { ini: p[a].registrado_em!, fim: p[b].registrado_em!, km, minutos: Math.round((t(p[b]) - t(p[a])) / 60000), velMax, iIni: a, iFim: b };
}

export function fmtDuracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
