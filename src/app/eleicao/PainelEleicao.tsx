'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import {
  montarMalha, montarContornos, corDoMunicipio, corDaFaixa, IBGE_UF,
  PALETAS, PALETAS_GOV, COR_SEM_DADOS, FAIXAS_LEGENDA, type Malha, type Paleta,
} from '@/lib/eleicao/mapa';

// Tipos espelhando /api/eleicao (src/lib/eleicao/tse.ts).
type Candidato = { n: string; nome: string; partido: string; vice: string; votos: number; pct: number; situacao: string; foto: string };
type Resumo = {
  pctApurado: number; eleitores: number; comparecimento: number; pctComparecimento: number;
  abstencao: number; pctAbstencao: number; validos: number; brancos: number; pctBrancos: number;
  nulos: number; pctNulos: number; horaTse: string;
};
type Parcial = [number, number, number];
type Disputa = {
  id: string; uf: string; disponivel: boolean; candidatos: Candidato[]; finalistas: string[];
  resumo: Resumo | null; ufs: Record<string, Parcial>; historico?: Parcial[];
};
type RespResumo = {
  modo: 'real' | 'teste'; versao: number; atualizadoEm: string | null; mapaPausadoAte?: string | null;
  presidente: Disputa; governadores: Disputa[];
};
type RespMapa = {
  versao: number;
  presidente: { finalistas: string[]; mun: Record<string, Parcial> };
  governadores: { id: string; finalistas: string[]; mun: Record<string, Parcial> }[];
};
type Topo = Parameters<typeof montarMalha>[0];

const VERDE = '#22C55E'; // cor da marca Demais FM
// Tons das linhas do gráfico: mesmos matizes do mapa, um passo mais claros pra ler no
// fundo escuro (par validado: separação para daltonismo e contraste com o fundo).
const LINHAS = ['#3B82F6', '#EF4444'];

const NOME_UF: Record<string, string> = {
  ac: 'Acre', al: 'Alagoas', am: 'Amazonas', ap: 'Amapá', ba: 'Bahia', ce: 'Ceará',
  df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mg: 'Minas Gerais',
  ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', pa: 'Pará', pb: 'Paraíba', pe: 'Pernambuco',
  pi: 'Piauí', pr: 'Paraná', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', ro: 'Rondônia',
  rr: 'Roraima', rs: 'Rio Grande do Sul', sc: 'Santa Catarina', se: 'Sergipe', sp: 'São Paulo',
  to: 'Tocantins',
};
const UF_POR_IBGE = Object.fromEntries(Object.entries(IBGE_UF).map(([uf, c]) => [c, uf]));
const UFS = Object.keys(NOME_UF);

// Modo automático ("passar sozinho"): Brasil, depois cada estado.
const TEMPO_BRASIL_MS = 12_000;
const TEMPO_ESTADO_MS = 6_000;

const pct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const votos = (n: number) => n.toLocaleString('pt-BR');

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function Foto({ c, cor, tamanho }: { c: Candidato; cor: string; tamanho: number }) {
  const [erro, setErro] = useState(false);
  return (
    <div className="rounded-full overflow-hidden shrink-0 flex items-center justify-center font-black bg-slate-800"
      style={{ width: tamanho, height: tamanho, boxShadow: `0 0 0 3px ${cor}`, fontSize: tamanho / 3 }}>
      {erro
        ? <span style={{ color: cor }}>{iniciais(c.nome)}</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={c.foto} alt={c.nome} referrerPolicy="no-referrer" className="w-full h-full object-cover object-top" onError={() => setErro(true)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------

const MapaSvg = memo(function MapaSvg({ malha, cores, contorno, selecionado, onToque, onPassar }: {
  malha: Malha; cores: Record<string, string>; contorno?: string; selecionado?: string | null;
  onToque?: (cod: string | null) => void; onPassar?: (cod: string | null) => void;
}) {
  const formaSel = selecionado ? malha.formas.find(f => f.cod === selecionado) : null;
  const alvo = (e: React.SyntheticEvent) => (e.target as Element).getAttribute?.('data-c');
  return (
    <svg viewBox={malha.viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet"
      onClick={onToque ? e => onToque(alvo(e)) : undefined}
      onPointerMove={onPassar ? e => { if (e.pointerType === 'mouse') { const c = alvo(e); if (c) onPassar(c); } } : undefined}
      role="img" aria-label="Mapa da apuração por município" style={{ cursor: onToque ? 'pointer' : undefined }}>
      <g stroke="#0B1120" strokeWidth={malha.largura / 4000} strokeLinejoin="round">
        {malha.formas.map(f => <path key={f.cod} data-c={f.cod} d={f.d} fill={cores[f.cod] || COR_SEM_DADOS} />)}
      </g>
      {contorno && <path d={contorno} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={malha.largura / 1100} pointerEvents="none" />}
      {formaSel && <path d={formaSel.d} fill="none" stroke="#fff" strokeWidth={malha.largura / 350} pointerEvents="none" />}
    </svg>
  );
});

function Legenda({ nomes, paletas }: { nomes: string[]; paletas: Paleta[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-slate-300">
      {[0, 1].map(i => (
        <div key={i} className="flex items-center gap-2">
          <span className="font-bold">{nomes[i]}</span>
          <div className="flex">
            {FAIXAS_LEGENDA.map(f => <span key={f} className="w-5 h-3 first:rounded-l last:rounded-r" style={{ background: corDaFaixa(f, paletas[i]) }} />)}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: COR_SEM_DADOS, boxShadow: 'inset 0 0 0 1px #334155' }} /> sem votos apurados</div>
      <span className="text-slate-500 w-full text-center">Quanto mais escuro, maior a vantagem no município</span>
    </div>
  );
}

function BarraDisputa({ a, b, cores }: { a: number; b: number; cores: string[] }) {
  const total = a + b;
  const pa = total ? (a / total) * 100 : 50;
  return (
    <div className="relative h-4 sm:h-5 rounded-full overflow-hidden bg-slate-800 flex">
      <div className="h-full transition-all duration-700" style={{ width: `${pa}%`, background: cores[0] }} />
      <div className="h-full flex-1 transition-all duration-700" style={{ background: total ? cores[1] : '#334155' }} />
      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/80" />
    </div>
  );
}

// "Os dois ao longo da apuração": % de cada um (entre os dois) conforme as urnas são
// apuradas. Eixo X = % de urnas apuradas, eixo Y = % dos votos dos dois.
function GraficoEvolucao({ historico, nomes }: { historico: Parcial[]; nomes: string[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 600, H = 210, M = { t: 14, r: 110, b: 28, l: 40 };
  const pontos = historico.filter(p => p[1] + p[2] > 0).map(p => ({ x: p[0], a: (p[1] / (p[1] + p[2])) * 100 }));

  if (pontos.length < 2) {
    return <div className="text-xs text-slate-500 text-center py-6">O gráfico vai se formando conforme as urnas são apuradas.</div>;
  }

  const valores = pontos.flatMap(p => [p.a, 100 - p.a]);
  const folga = Math.max(10, Math.ceil((Math.max(...valores.map(v => Math.abs(v - 50))) + 2) / 5) * 5);
  const [y0, y1] = [50 - folga, 50 + folga];
  const sx = (x: number) => M.l + (x / 100) * (W - M.l - M.r);
  const sy = (y: number) => M.t + (1 - (y - y0) / (y1 - y0)) * (H - M.t - M.b);
  const linha = (f: (p: { x: number; a: number }) => number) => pontos.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(f(p)).toFixed(1)}`).join('');
  const ult = pontos[pontos.length - 1];
  const f = foco !== null ? pontos[foco] : null;

  const aoMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let melhor = 0;
    pontos.forEach((p, i) => { if (Math.abs(sx(p.x) - x) < Math.abs(sx(pontos[melhor].x) - x)) melhor = i; });
    setFoco(melhor);
  };

  // Rótulos diretos no fim das linhas, afastados se ficarem colados.
  let [ya, yb] = [sy(ult.a), sy(100 - ult.a)];
  if (Math.abs(ya - yb) < 16) { const m = (ya + yb) / 2, s = ya < yb ? -1 : 1; ya = m + s * 8; yb = m - s * 8; }

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300 mb-1">
        {nomes.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: LINHAS[i] }} />{n}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none" onPointerMove={aoMover} onPointerLeave={() => setFoco(null)}
        role="img" aria-label={`Evolução da apuração: ${nomes[0]} ${pct(ult.a)}, ${nomes[1]} ${pct(100 - ult.a)}`}>
        {[y0, 50, y1].map(y => (
          <g key={y}>
            <line x1={M.l} x2={W - M.r} y1={sy(y)} y2={sy(y)} stroke={y === 50 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'} strokeDasharray={y === 50 ? '4 4' : undefined} />
            <text x={M.l - 6} y={sy(y) + 4} textAnchor="end" fontSize={11} fill="#94A3B8">{y}%</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map(x => (
          <text key={x} x={sx(x)} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748B">{x}%</text>
        ))}
        <path d={linha(p => p.a)} fill="none" stroke={LINHAS[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={linha(p => 100 - p.a)} fill="none" stroke={LINHAS[1]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={sx(ult.x)} cy={sy(ult.a)} r={4} fill={LINHAS[0]} stroke="#070B14" strokeWidth={2} />
        <circle cx={sx(ult.x)} cy={sy(100 - ult.a)} r={4} fill={LINHAS[1]} stroke="#070B14" strokeWidth={2} />
        <text x={sx(ult.x) + 10} y={ya + 4} fontSize={12} fill="#E2E8F0" fontWeight={700}>{pct(ult.a)}</text>
        <text x={sx(ult.x) + 10} y={yb + 4} fontSize={12} fill="#E2E8F0" fontWeight={700}>{pct(100 - ult.a)}</text>
        {f && (
          <g pointerEvents="none">
            <line x1={sx(f.x)} x2={sx(f.x)} y1={M.t} y2={H - M.b} stroke="rgba(255,255,255,0.35)" />
            <circle cx={sx(f.x)} cy={sy(f.a)} r={4} fill={LINHAS[0]} stroke="#070B14" strokeWidth={2} />
            <circle cx={sx(f.x)} cy={sy(100 - f.a)} r={4} fill={LINHAS[1]} stroke="#070B14" strokeWidth={2} />
          </g>
        )}
      </svg>
      <div className="text-[11px] text-slate-400 text-center tabular-nums h-4">
        {f
          ? <>Com {pct(f.x)} apurado: {nomes[0]} {pct(f.a)} · {nomes[1]} {pct(100 - f.a)}</>
          : <span className="text-slate-500">% de urnas apuradas → (passe o dedo ou o mouse no gráfico)</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------

export default function PainelEleicao() {
  const [params, setParams] = useState<{ teste: boolean; tv: boolean } | null>(null);
  const [resumo, setResumo] = useState<RespResumo | null>(null);
  const [mapa, setMapa] = useState<RespMapa | null>(null);
  const [erro, setErro] = useState('');
  const [nomesMun, setNomesMun] = useState<Record<string, [string, string]>>({});
  const [topoMun, setTopoMun] = useState<Topo | null>(null);
  const [malhaBr, setMalhaBr] = useState<Malha | null>(null);
  const [contorno, setContorno] = useState('');
  const [malhasGov, setMalhasGov] = useState<Record<string, Malha>>({});
  const malhasUf = useRef<Record<string, Malha>>({});
  const [vista, setVista] = useState<string>('br'); // 'br' ou a UF em zoom
  const [auto, setAuto] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [podeTelaCheia, setPodeTelaCheia] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const tv = sp.get('tv') === '1';
    setParams({ teste: sp.get('teste') === '1', tv });
    setAuto(tv || sp.get('auto') === '1');
    setPodeTelaCheia(!!document.fullscreenEnabled);
    const aoMudarTela = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', aoMudarTela);
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => { clearInterval(t); document.removeEventListener('fullscreenchange', aoMudarTela); };
  }, []);

  const q = params?.teste ? '&teste=1' : '';

  // Resumo a cada 4s (pequeno); o mapa por município (~50 KB) só quando a versão muda e no
  // máximo a cada 30s no celular / 10s na TV — com muitos ouvintes ao mesmo tempo, baixar o
  // mapa a cada versão (~5s) multiplicaria o tráfego da Vercel sem ganho visível.
  useEffect(() => {
    if (!params) return;
    const intervaloMapa = params.tv ? 10_000 : 30_000;
    let vivo = true, versaoMapa = -1, mapaEm = 0;
    let timer: ReturnType<typeof setTimeout>;
    const ciclo = async () => {
      try {
        const r = await fetch(`/api/eleicao?parte=resumo${q}`, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
        if (!vivo) return;
        setResumo(j); setErro('');
        if (j.versao !== versaoMapa && (versaoMapa < 0 || Date.now() - mapaEm >= intervaloMapa)) {
          const m = await fetch(`/api/eleicao?parte=mapa&v=${j.versao}${q}`).then(x => x.json());
          if (vivo && m?.presidente) { versaoMapa = j.versao; mapaEm = Date.now(); setMapa(m); }
        }
      } catch (e: any) {
        if (vivo) setErro(e.message || 'Sem conexão');
      }
      if (vivo) timer = setTimeout(ciclo, document.hidden ? 15000 : 4000);
    };
    ciclo();
    return () => { vivo = false; clearTimeout(timer); };
  }, [params, q]);

  // Malhas do IBGE (estáticas em /public/eleicao) + nomes dos municípios.
  useEffect(() => {
    if (!params) return;
    Promise.all([
      fetch('/eleicao/br-municipios.topo.json').then(r => r.json()),
      fetch('/eleicao/br-ufs.topo.json').then(r => r.json()),
    ]).then(([mun, ufs]) => {
      setTopoMun(mun);
      setMalhaBr(montarMalha(mun));
      setContorno(montarContornos(ufs, mun));
      const gov: Record<string, Malha> = {};
      for (const uf of ['ac', 'am', 'df', 'es', 'rn']) gov[uf] = montarMalha(mun, c => c.startsWith(IBGE_UF[uf]), 400);
      setMalhasGov(gov);
    }).catch(() => setErro('Não foi possível carregar o mapa.'));
    fetch(`/api/eleicao?parte=municipios${q}`).then(r => r.ok ? r.json() : {}).then(setNomesMun).catch(() => {});
  }, [params, q]);

  // Modo automático: Brasil -> cada estado -> Brasil...
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      setSelecionado(null);
      setVista(v => v === 'br' ? UFS[0] : (UFS[UFS.indexOf(v) + 1] || 'br'));
    }, vista === 'br' ? TEMPO_BRASIL_MS : TEMPO_ESTADO_MS);
    return () => clearTimeout(t);
  }, [auto, vista]);

  const malhaVista = useMemo(() => {
    if (vista === 'br') return malhaBr;
    if (!topoMun) return null;
    return (malhasUf.current[vista] ||= montarMalha(topoMun, c => c.startsWith(IBGE_UF[vista]), 1000));
  }, [vista, topoMun, malhaBr]);

  const pres = resumo?.presidente;
  const finalistasPres = useMemo(
    () => (pres?.finalistas || []).map(n => pres!.candidatos.find(c => c.n === n)).filter(Boolean) as Candidato[],
    [pres],
  );

  const coresBr = useMemo(() => {
    const cores: Record<string, string> = {};
    for (const [cod, [, a, b]] of Object.entries(mapa?.presidente.mun || {})) cores[cod] = corDoMunicipio(a, b, PALETAS);
    return cores;
  }, [mapa]);

  const irPara = useCallback((v: string) => { setAuto(false); setSelecionado(null); setVista(v); }, []);
  const tocarMapa = useCallback((cod: string | null) => {
    if (!cod) return;
    setAuto(false);
    // No Brasil, tocar aproxima o estado; dentro do estado, mostra a cidade.
    if (vista === 'br') { const uf = UF_POR_IBGE[cod.slice(0, 2)]; if (uf) { setSelecionado(null); setVista(uf); } }
    else setSelecionado(cod);
  }, [vista]);
  const passarMapa = useCallback((cod: string | null) => setSelecionado(cod), []);

  const alternarTelaCheia = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  if (!params) return <div className="min-h-screen bg-[#070B14]" />;

  const r = pres?.resumo;
  const atualizadoHa = resumo?.atualizadoEm ? Math.max(0, Math.round((agora - new Date(resumo.atualizadoEm).getTime()) / 1000)) : null;
  const atrasado = atualizadoHa !== null && atualizadoHa > 60;
  const aguardando = !pres?.disponivel || (r && r.pctApurado === 0 && finalistasPres.every(c => c.votos === 0));
  const munSel = selecionado ? mapa?.presidente.mun[selecionado] : null;
  const nomeSel = selecionado ? nomesMun[selecionado] : null;
  const coresPres = PALETAS.map(p => p.base);
  const parcialUf = vista !== 'br' ? pres?.ufs?.[vista] : null;
  const totUf = parcialUf ? parcialUf[1] + parcialUf[2] : 0;
  const nomes = finalistasPres.map(c => c.nome);

  return (
    <div className={`min-h-screen bg-[#070B14] text-white ${params.tv ? 'cursor-none' : ''}`}>
      {/* Topo */}
      <header className="sticky top-0 z-20 bg-[#070B14]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-demais.png" alt="Demais FM" className="h-8 sm:h-10 w-auto" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black leading-tight uppercase tracking-tight">Apuração · 2º Turno 2026</h1>
              <p className="text-[11px] sm:text-xs text-slate-400">Dados oficiais do TSE · atualização automática</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:ml-auto">
            {params.teste && <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-amber-500/20 text-amber-300">Modo teste · dados do 1º turno</span>}
            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 py-1 rounded-full"
              style={{ background: atrasado || erro ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)', color: atrasado || erro ? '#FACC15' : VERDE }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: atrasado || erro ? '#FACC15' : VERDE }} />
              {erro ? 'Reconectando' : atrasado ? 'TSE sem atualização' : 'Ao vivo'}
            </span>
            <div className="text-right">
              <div className="text-2xl sm:text-4xl font-black tabular-nums leading-none" style={{ color: VERDE }}>{r ? pct(r.pctApurado) : '—'}</div>
              <div className="text-[10px] sm:text-[11px] uppercase text-slate-400 font-bold">urnas apuradas</div>
            </div>
            {podeTelaCheia && !params.tv && (
              <button onClick={alternarTelaCheia} title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'} aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
                className="p-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5">
                {telaCheia ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4 space-y-4">
        {aguardando && resumo && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-slate-300">
            {pres?.disponivel
              ? 'Aguardando início da apuração. O TSE começa a divulgar os resultados às 17h (horário de Brasília).'
              : 'O TSE ainda não publicou os dados desta eleição. O painel atualiza sozinho assim que sair.'}
          </div>
        )}
        {resumo?.mapaPausadoAte && new Date(resumo.mapaPausadoAte).getTime() > agora && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
            O TSE está limitando o acesso: o mapa por cidade pode ficar alguns minutos atrasado. Os totais do presidente seguem ao vivo.
          </div>
        )}
        {!resumo && !erro && <div className="text-center text-slate-400 py-10">Carregando apuração…</div>}
        {erro && !resumo && <div className="text-center text-amber-300 py-10">{erro}</div>}

        {resumo && (
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            {/* Mapa */}
            <section className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 sm:p-4 flex flex-col">
              <div className="flex flex-wrap items-center gap-2 mb-2 min-h-[36px]">
                {vista === 'br' ? (
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Presidente · Brasil por município</h2>
                ) : (
                  <>
                    {!params.tv && (
                      <button onClick={() => irPara('br')} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200">
                        <ArrowLeft size={14} /> Brasil
                      </button>
                    )}
                    <h2 className="text-sm sm:text-base font-black uppercase tracking-wide">{NOME_UF[vista]}</h2>
                    {parcialUf && (
                      <span className="text-[11px] text-slate-400 tabular-nums">{pct(parcialUf[0])} apurado</span>
                    )}
                  </>
                )}
                {!params.tv && (
                  <button onClick={() => setAuto(a => !a)} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
                    title="Passa pelo Brasil e por cada estado sozinho">
                    {auto ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Passar sozinho</>}
                  </button>
                )}
              </div>

              {vista !== 'br' && parcialUf && finalistasPres.length === 2 && (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  {finalistasPres.map((c, i) => (
                    <div key={c.n} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETAS[i].base }} />
                      <span className="text-xs sm:text-sm font-bold truncate">{c.nome}</span>
                      <span className="ml-auto text-base sm:text-xl font-black tabular-nums">{totUf ? pct((parcialUf[i + 1] / totUf) * 100) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative flex-1 min-h-[300px] lg:min-h-[500px]" onPointerLeave={() => setSelecionado(null)}>
                {malhaVista
                  ? <MapaSvg malha={malhaVista} cores={coresBr} contorno={vista === 'br' ? contorno : undefined} selecionado={selecionado}
                      onToque={params.tv ? undefined : tocarMapa} onPassar={params.tv ? undefined : passarMapa} />
                  : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Carregando mapa…</div>}
                {nomeSel && (
                  <div className="absolute left-2 bottom-2 rounded-xl bg-[#0B1120]/95 border border-white/15 px-3 py-2 text-xs shadow-xl min-w-[190px] pointer-events-none">
                    <div className="font-black text-sm">{nomeSel[0]} <span className="text-slate-400">· {nomeSel[1].toUpperCase()}</span></div>
                    {munSel ? (
                      <>
                        <div className="text-slate-400 mb-1">{pct(munSel[0])} apurado</div>
                        {finalistasPres.map((c, i) => {
                          const tot = munSel[1] + munSel[2];
                          const v = munSel[i + 1];
                          return (
                            <div key={c.n} className="flex justify-between gap-3">
                              <span className="font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: PALETAS[i].base }} />{c.nome}</span>
                              <span className="tabular-nums">{tot ? pct((v / tot) * 100) : '—'} <span className="text-slate-500">({votos(v)})</span></span>
                            </div>
                          );
                        })}
                      </>
                    ) : <div className="text-slate-400">Sem votos apurados ainda</div>}
                  </div>
                )}
                {!params.tv && vista === 'br' && (
                  <span className="absolute right-2 bottom-2 text-[11px] text-slate-500 pointer-events-none">Toque num estado para aproximar</span>
                )}
              </div>
              {finalistasPres.length === 2 && <div className="mt-3"><Legenda nomes={nomes} paletas={PALETAS} /></div>}
            </section>

            {/* Candidatos */}
            <section className="space-y-4">
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                  {finalistasPres.map((c, i) => (
                    <div key={c.n} className="flex flex-col items-center text-center">
                      <Foto c={c} cor={coresPres[i]} tamanho={params.tv ? 140 : 96} />
                      <div className="mt-3 font-black text-sm sm:text-lg leading-tight">{c.nome}</div>
                      <div className="text-[11px] sm:text-xs text-slate-400">{c.n} · {c.partido}</div>
                      <div className="mt-2 text-4xl sm:text-5xl xl:text-6xl font-black tabular-nums" style={{ color: PALETAS[i].clara }}>{pct(c.pct)}</div>
                      <div className="text-xs sm:text-sm text-slate-300 tabular-nums">{votos(c.votos)} votos</div>
                    </div>
                  ))}
                </div>
                {finalistasPres.length === 2 && (
                  <div className="mt-4">
                    <BarraDisputa a={finalistasPres[0].votos} b={finalistasPres[1].votos} cores={coresPres} />
                    <div className="mt-1.5 text-center text-xs text-slate-400">
                      {finalistasPres[0].votos !== finalistasPres[1].votos
                        ? <>Diferença: <b className="text-white tabular-nums">{votos(Math.abs(finalistasPres[0].votos - finalistasPres[1].votos))}</b> votos</>
                        : 'Empate'}
                    </div>
                  </div>
                )}
              </div>

              {r && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ['Comparecimento', r.pctComparecimento, r.comparecimento],
                    ['Abstenção', r.pctAbstencao, r.abstencao],
                    ['Brancos', r.pctBrancos, r.brancos],
                    ['Nulos', r.pctNulos, r.nulos],
                  ].map(([rot, p, v]) => (
                    <div key={rot as string} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400">{rot}</div>
                      <div className="text-lg font-black tabular-nums">{pct(p as number)}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">{votos(v as number)}</div>
                    </div>
                  ))}
                </div>
              )}

              {finalistasPres.length === 2 && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                  <h2 className="text-xs font-black uppercase tracking-wide text-slate-300 mb-2">Os dois ao longo da apuração</h2>
                  <GraficoEvolucao historico={pres?.historico || []} nomes={nomes} />
                </div>
              )}

              {/* Por estado */}
              {finalistasPres.length === 2 && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                  <h2 className="text-xs font-black uppercase tracking-wide text-slate-300 mb-2">Por estado {!params.tv && <span className="normal-case font-normal text-slate-500">· toque para ver no mapa</span>}</h2>
                  <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-5 xl:grid-cols-7 gap-1.5">
                    {UFS.map(uf => {
                      const p = pres?.ufs?.[uf];
                      const tot = p ? p[1] + p[2] : 0;
                      const lider = p && tot ? (p[1] >= p[2] ? 0 : 1) : -1;
                      const share = lider >= 0 ? (Math.max(p![1], p![2]) / tot) * 100 : 0;
                      return (
                        <button key={uf} title={NOME_UF[uf]} onClick={() => irPara(uf)} disabled={params.tv}
                          className={`rounded-lg px-1.5 py-1 text-center transition ${vista === uf ? 'ring-2 ring-white' : ''}`}
                          style={{ background: p ? corDoMunicipio(p[1], p[2], PALETAS) : COR_SEM_DADOS }}>
                          <div className="text-[11px] font-black uppercase">{uf}</div>
                          <div className="text-[10px] font-bold tabular-nums opacity-90">{lider >= 0 ? share.toFixed(1) + '%' : '—'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500 text-center">
                {r?.horaTse && <>Última totalização do TSE: {r.horaTse}</>}
                {atualizadoHa !== null && <> · verificado há {atualizadoHa}s</>}
              </p>
            </section>
          </div>
        )}

        {/* Governadores */}
        {resumo && (
          <section>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-300 mb-2">Governadores · 2º turno</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {resumo.governadores.map(g => (
                <CartaoGovernador key={g.id} g={g} malha={malhasGov[g.uf]}
                  mun={mapa?.governadores.find(m => m.id === g.id)?.mun || {}} tv={params.tv} />
              ))}
            </div>
          </section>
        )}

        <footer className="text-center text-[11px] text-slate-600 pt-2 pb-6">
          Fonte: Tribunal Superior Eleitoral (resultados.tse.jus.br) · Mapa: IBGE · Demais FM
        </footer>
      </main>
    </div>
  );
}

function CartaoGovernador({ g, malha, mun, tv }: { g: Disputa; malha?: Malha; mun: Record<string, Parcial>; tv: boolean }) {
  const fin = g.finalistas.map(n => g.candidatos.find(c => c.n === n)).filter(Boolean) as Candidato[];
  const cores = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [cod, [, a, b]] of Object.entries(mun)) out[cod] = corDoMunicipio(a, b, PALETAS_GOV);
    return out;
  }, [mun]);
  const lider = fin.length === 2 && fin[0].votos !== fin[1].votos ? (fin[0].votos > fin[1].votos ? 0 : 1) : -1;

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-black">{NOME_UF[g.uf]}</h3>
        <span className="text-xs text-slate-400 tabular-nums">{g.resumo ? pct(g.resumo.pctApurado) : '—'} apurado</span>
      </div>
      {!g.disponivel ? (
        <div className="text-xs text-slate-500 py-4 text-center">Aguardando dados do TSE</div>
      ) : (
        <>
          {g.uf !== 'df' && malha && (
            <div className={tv ? 'h-28' : 'h-32'}>
              <MapaSvg malha={malha} cores={cores} />
            </div>
          )}
          {fin.map((c, i) => (
            <div key={c.n} className="flex items-center gap-2.5">
              <Foto c={c} cor={PALETAS_GOV[i].base} tamanho={tv ? 52 : 44} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-sm truncate">{c.nome}{lider === i && <span className="ml-1 text-[10px]" style={{ color: VERDE }}>▲</span>}</span>
                  <span className="font-black tabular-nums" style={{ color: PALETAS_GOV[i].clara }}>{pct(c.pct)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>{c.n} · {c.partido}</span>
                  <span className="tabular-nums">{votos(c.votos)}</span>
                </div>
              </div>
            </div>
          ))}
          {fin.length === 2 && <BarraDisputa a={fin[0].votos} b={fin[1].votos} cores={PALETAS_GOV.map(p => p.base)} />}
        </>
      )}
    </div>
  );
}
