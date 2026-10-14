// Malha do IBGE (TopoJSON, qualidade mínima) -> caminhos SVG, sem depender de d3.
// Projeção equiretangular com correção de cosseno na latitude média do recorte: pro
// tamanho do Brasil numa tela de TV/celular a distorção não aparece e o cálculo é trivial.

type Topo = {
  arcs: number[][][];
  transform: { scale: [number, number]; translate: [number, number] };
  objects: Record<string, { geometries: { type: string; arcs: any; properties: { codarea: string } }[] }>;
};

export type Forma = { cod: string; d: string };
export type Malha = { formas: Forma[]; viewBox: string; largura: number; altura: number };

// Código IBGE da UF (2 primeiros dígitos do município) por sigla.
export const IBGE_UF: Record<string, string> = {
  ro: '11', ac: '12', am: '13', rr: '14', pa: '15', ap: '16', to: '17', ma: '21', pi: '22', ce: '23',
  rn: '24', pb: '25', pe: '26', al: '27', se: '28', ba: '29', mg: '31', es: '32', rj: '33', sp: '35',
  pr: '41', sc: '42', rs: '43', ms: '50', mt: '51', go: '52', df: '53',
};

function decodificarArcos(t: Topo): [number, number][][] {
  const [sx, sy] = t.transform.scale, [tx, ty] = t.transform.translate;
  return t.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty] as [number, number]; });
  });
}

function aneis(geom: { type: string; arcs: any }, arcos: [number, number][][]): [number, number][][] {
  const anel = (idx: number[]) => {
    const pts: [number, number][] = [];
    idx.forEach((i, k) => {
      const a = i < 0 ? [...arcos[~i]].reverse() : arcos[i];
      pts.push(...(k === 0 ? a : a.slice(1)));
    });
    return pts;
  };
  if (geom.type === 'Polygon') return (geom.arcs as number[][]).map(anel);
  if (geom.type === 'MultiPolygon') return (geom.arcs as number[][][]).flatMap(p => p.map(anel));
  return [];
}

export function montarMalha(topo: Topo, filtro?: (cod: string) => boolean, larguraAlvo = 1000): Malha {
  const arcos = decodificarArcos(topo);
  const geoms = Object.values(topo.objects)[0].geometries.filter(g => !filtro || filtro(g.properties.codarea));
  const porGeom = geoms.map(g => ({ cod: g.properties.codarea, aneis: aneis(g, arcos) }));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of porGeom) for (const r of g.aneis) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cosLat = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  const k = larguraAlvo / ((maxX - minX) * cosLat || 1);
  const px = (x: number) => Math.round((x - minX) * cosLat * k);
  const py = (y: number) => Math.round((maxY - y) * k);

  const formas = porGeom.map(g => ({
    cod: g.cod,
    d: g.aneis.map(r => 'M' + r.map(([x, y]) => px(x) + ',' + py(y)).join('L') + 'Z').join(''),
  }));
  const altura = (maxY - minY) * k;
  return { formas, viewBox: `0 0 ${larguraAlvo} ${altura.toFixed(0)}`, largura: larguraAlvo, altura };
}

// Mesma projeção de uma malha já montada, aplicada a outra (contorno das UFs por cima dos
// municípios). Recalcula a partir da malha de municípios pra ficar alinhado.
export function montarContornos(topoUfs: Topo, topoMun: Topo, larguraAlvo = 1000): string {
  const arcosMun = decodificarArcos(topoMun);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const a of arcosMun) for (const [x, y] of a) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cosLat = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  const k = larguraAlvo / ((maxX - minX) * cosLat || 1);
  const arcos = decodificarArcos(topoUfs);
  // Cada arco é desenhado uma vez só (fronteira compartilhada entre duas UFs não duplica).
  return arcos.map(a => 'M' + a.map(([x, y]) => ((x - minX) * cosLat * k).toFixed(1) + ',' + ((maxY - y) * k).toFixed(1)).join('L')).join('');
}

// --- Cores ----------------------------------------------------------------------------------

export type Paleta = { clara: string; escura: string; base: string };

export const PALETAS: Paleta[] = [
  { base: '#2563EB', clara: '#93C5FD', escura: '#1E3A8A' }, // A — azul (Flávio)
  { base: '#DC2626', clara: '#FCA5A5', escura: '#7F1D1D' }, // B — vermelho (Lula)
];
// Governadores: cores neutras (sem associar candidato estadual a lado da disputa nacional).
export const PALETAS_GOV: Paleta[] = [
  { base: '#F59E0B', clara: '#FCD34D', escura: '#92400E' },
  { base: '#8B5CF6', clara: '#C4B5FD', escura: '#4C1D95' },
];

export const COR_SEM_DADOS = '#1E293B';
const COR_EMPATE = '#64748B';

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function misturar(a: string, b: string, t: number) {
  const ca = hex(a), cb = hex(b);
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Gradiente pela força da vitória no município: 50% = tom claro, ≥85% = tom escuro.
export function corDoMunicipio(vA: number, vB: number, paletas: Paleta[]) {
  const total = vA + vB;
  if (!total) return COR_SEM_DADOS;
  if (vA === vB) return COR_EMPATE;
  const p = vA > vB ? paletas[0] : paletas[1];
  const share = Math.max(vA, vB) / total;
  return misturar(p.clara, p.escura, Math.min(1, (share - 0.5) / 0.35));
}

export const FAIXAS_LEGENDA = [0.52, 0.6, 0.7, 0.85];
export function corDaFaixa(share: number, p: Paleta) {
  return misturar(p.clara, p.escura, Math.min(1, (share - 0.5) / 0.35));
}
