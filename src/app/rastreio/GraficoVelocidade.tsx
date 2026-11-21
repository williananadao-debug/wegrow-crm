"use client";
import { useMemo, useRef, useState } from 'react';

type P = { velocidade?: number | null; registrado_em?: string };

const W = 800, H = 150, PAD_L = 34, PAD_R = 8, PAD_T = 10, PAD_B = 20;
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Velocidade ao longo do dia (série única, eixo de tempo real). Linha do limite tracejada com
 * rótulo. Passar o mouse mostra hora e km/h; clicar leva o replay para aquele ponto.
 */
export default function GraficoVelocidade({ pontos, limite, indice, onEscolher }: {
  pontos: P[]; limite?: number | null; indice?: number | null; onEscolher?: (i: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    const ts = pontos.map(p => (p.registrado_em ? new Date(p.registrado_em).getTime() : 0));
    const t0 = ts[0] || 0, t1 = ts[ts.length - 1] || 1;
    const vmax = Math.max(40, Number(limite || 0) + 10, ...pontos.map(p => Number(p.velocidade || 0)));
    const topo = Math.ceil(vmax / 20) * 20;
    const x = (t: number) => PAD_L + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD_L - PAD_R);
    const y = (v: number) => PAD_T + (1 - v / topo) * (H - PAD_T - PAD_B);
    // Buraco de mais de 10 min sem posição = linha interrompida (não inventa velocidade).
    let d = '';
    pontos.forEach((p, i) => {
      const novo = i === 0 || ts[i] - ts[i - 1] > 10 * 60_000;
      d += `${novo ? 'M' : 'L'}${x(ts[i]).toFixed(1)},${y(Number(p.velocidade || 0)).toFixed(1)}`;
    });
    const grade = [0, topo / 2, topo];
    const marcas = Array.from({ length: 5 }, (_, k) => t0 + ((t1 - t0) * k) / 4);
    return { ts, x, y, d, grade, marcas, topo };
  }, [pontos, limite]);

  if (pontos.length < 2) return null;

  const indicePorX = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const xs = ((clientX - r.left) / r.width) * W;
    let melhor = 0, dist = Infinity;
    for (let i = 0; i < g.ts.length; i++) {
      const dd = Math.abs(g.x(g.ts[i]) - xs);
      if (dd < dist) { dist = dd; melhor = i; }
    }
    return melhor;
  };

  const ativo = hover ?? indice ?? null;
  const pa = ativo != null ? pontos[ativo] : null;
  const xa = ativo != null ? g.x(g.ts[ativo]) : 0;

  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Velocidade no dia</p>
        <p className="text-xs text-slate-300 tabular-nums h-4">
          {pa ? `${hora(g.ts[ativo!])} · ${Math.round(Number(pa.velocidade || 0))} km/h` : onEscolher ? 'clique para levar o replay ao ponto' : ''}
        </p>
      </div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none cursor-crosshair"
        role="img" aria-label={`Gráfico de velocidade: máxima de ${Math.round(Math.max(...pontos.map(p => Number(p.velocidade || 0))))} km/h`}
        onMouseMove={e => setHover(indicePorX(e.clientX))} onMouseLeave={() => setHover(null)}
        onClick={e => onEscolher?.(indicePorX(e.clientX))}>
        {g.grade.map(v => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={g.y(v)} y2={g.y(v)} stroke="#1E293B" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={PAD_L - 6} y={g.y(v) + 3} textAnchor="end" fontSize={10} fill="#64748B">{v}</text>
          </g>
        ))}
        {g.marcas.map((t, i) => (
          <text key={i} x={g.x(t)} y={H - 5} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fontSize={10} fill="#64748B">{hora(t)}</text>
        ))}
        {limite ? (
          <g>
            <line x1={PAD_L} x2={W - PAD_R} y1={g.y(limite)} y2={g.y(limite)} stroke="#F87171" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            <text x={W - PAD_R - 2} y={g.y(limite) - 4} textAnchor="end" fontSize={10} fill="#CBD5E1">limite {limite} km/h</text>
          </g>
        ) : null}
        <path d={g.d} fill="none" stroke="#38BDF8" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pa && (
          <g pointerEvents="none">
            <line x1={xa} x2={xa} y1={PAD_T} y2={H - PAD_B} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={xa} cy={g.y(Number(pa.velocidade || 0))} r={4} fill="#38BDF8" stroke="#0F172A" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
    </div>
  );
}
