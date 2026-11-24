"use client";
import { useState } from 'react';
import { CalendarRange, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

// Distribuição da mídia de um item (como o "Quando inserir essa mídia?" do beComm):
// períodos com data inicial/final, dias da semana e quantidade por dia, mais inserções avulsas.
// A quantidade do item passa a ser calculada: soma dos dias que caem nos períodos × por dia + avulsas.

export type PeriodoMidia = { inicio: string; fim: string; dias: number[]; porDia: number };
export type DistribuicaoMidia = { periodos: PeriodoMidia[]; avulsa?: number };

const NOMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const UTEIS = [1, 2, 3, 4, 5];
const FDS = [0, 6];
const TODOS = [0, 1, 2, 3, 4, 5, 6];

const dataLocal = (s: string) => new Date(`${s}T12:00:00`);
const valida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Quantos dias do período caem nos dias da semana escolhidos. */
export function diasNoPeriodo(p: PeriodoMidia) {
  if (!valida(p.inicio) || !valida(p.fim) || !p.dias.length) return 0;
  const ini = dataLocal(p.inicio), fim = dataLocal(p.fim);
  if (fim < ini) return 0;
  let n = 0;
  for (let d = new Date(ini); d <= fim && n < 4000; d.setDate(d.getDate() + 1)) if (p.dias.includes(d.getDay())) n++;
  return n;
}

export function totalInsercoes(dist?: DistribuicaoMidia | null) {
  if (!dist) return 0;
  return dist.periodos.reduce((s, p) => s + diasNoPeriodo(p) * Math.max(0, Number(p.porDia) || 0), 0) + Math.max(0, Number(dist.avulsa) || 0);
}

/** Texto curto para contrato/proposta: "24/11 a 30/11 · Seg a Sex · 2 por dia". */
export function resumoDistribuicao(dist?: DistribuicaoMidia | null) {
  if (!dist?.periodos?.length) return '';
  const br = (s: string) => s.split('-').reverse().slice(0, 2).join('/');
  const dias = (ds: number[]) => {
    const o = [...ds].sort();
    if (o.join() === TODOS.join()) return 'todos os dias';
    if (o.join() === UTEIS.join()) return 'Seg a Sex';
    if (o.join() === FDS.join()) return 'Sáb e Dom';
    return o.map(d => NOMES[d]).join(', ');
  };
  const partes = dist.periodos.map(p => `${br(p.inicio)} a ${br(p.fim)} · ${dias(p.dias)} · ${p.porDia} por dia`);
  if (dist.avulsa) partes.push(`+ ${dist.avulsa} avulsa${dist.avulsa > 1 ? 's' : ''}`);
  return partes.join(' | ');
}

export default function DistribuicaoItem({ dist, padraoInicio, padraoFim, disabled, onChange }: {
  dist?: DistribuicaoMidia | null;
  padraoInicio?: string; padraoFim?: string; disabled?: boolean;
  /** null = sem distribuição (quantidade volta a ser digitada) */
  onChange: (d: DistribuicaoMidia | null, quantidade: number) => void;
}) {
  const [aberto, setAberto] = useState(false);

  const novoPeriodo = (): PeriodoMidia => {
    const hoje = new Date();
    const ini = padraoInicio && valida(padraoInicio) ? padraoInicio : hoje.toLocaleDateString('en-CA');
    const f = new Date(dataLocal(ini)); f.setDate(f.getDate() + 29);
    const fim = padraoFim && valida(padraoFim) && padraoFim >= ini ? padraoFim : f.toLocaleDateString('en-CA');
    return { inicio: ini, fim, dias: [...UTEIS], porDia: 1 };
  };
  const mudar = (d: DistribuicaoMidia | null) => onChange(d, d ? totalInsercoes(d) : 1);
  const mudarPeriodo = (i: number, p: Partial<PeriodoMidia>) => {
    if (!dist) return;
    mudar({ ...dist, periodos: dist.periodos.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  };

  if (!dist) {
    return (
      <button type="button" disabled={disabled} onClick={() => { mudar({ periodos: [novoPeriodo()], avulsa: 0 }); setAberto(true); }}
        className="text-[9px] font-black uppercase text-sky-400 hover:text-sky-300 flex items-center gap-1 disabled:opacity-40">
        <CalendarRange size={10} /> Distribuir no período (datas e dias da semana)
      </button>
    );
  }

  const total = totalInsercoes(dist);
  const inp = 'bg-black/50 border border-white/10 rounded p-1.5 outline-none text-white text-[10px] [color-scheme:dark] disabled:opacity-50';
  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 space-y-2">
      <button type="button" onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between text-[9px] font-black uppercase text-sky-300">
        <span className="flex items-center gap-1"><CalendarRange size={10} /> Distribuição: {total} inserç{total === 1 ? 'ão' : 'ões'}</span>
        {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {!aberto && <p className="text-[9px] text-slate-400">{resumoDistribuicao(dist)}</p>}
      {aberto && (
        <>
          {dist.periodos.map((p, i) => {
            const n = diasNoPeriodo(p);
            const atalho = (ds: number[]) => p.dias.length === ds.length && ds.every(d => p.dias.includes(d));
            return (
              <div key={i} className="space-y-1.5 border-b border-white/5 pb-2">
                <div className="flex items-end gap-2 flex-wrap">
                  <label className="flex flex-col text-[8px] font-bold uppercase text-slate-500">Data inicial
                    <input type="date" value={p.inicio} disabled={disabled} onChange={e => mudarPeriodo(i, { inicio: e.target.value })} className={inp} /></label>
                  <label className="flex flex-col text-[8px] font-bold uppercase text-slate-500">Data final
                    <input type="date" value={p.fim} min={p.inicio} disabled={disabled} onChange={e => mudarPeriodo(i, { fim: e.target.value })} className={inp} /></label>
                  <label className="flex flex-col text-[8px] font-bold uppercase text-slate-500">Por dia
                    <input type="number" min={0} max={200} value={p.porDia} disabled={disabled} onChange={e => mudarPeriodo(i, { porDia: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} className={`${inp} w-14 text-center`} /></label>
                  {dist.periodos.length > 1 && (
                    <button type="button" disabled={disabled} onClick={() => mudar({ ...dist, periodos: dist.periodos.filter((_, j) => j !== i) })} className="text-red-400 p-1 mb-0.5" aria-label="Remover período"><Trash2 size={11} /></button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {([['Dias úteis', UTEIS], ['Fim de semana', FDS], ['Todos', TODOS]] as const).map(([t, ds]) => (
                    <button key={t} type="button" disabled={disabled} onClick={() => mudarPeriodo(i, { dias: [...ds] })}
                      className={`px-2 py-0.5 rounded-full border text-[9px] font-bold ${atalho([...ds]) ? 'border-sky-400 text-sky-300 bg-sky-500/15' : 'border-white/10 text-slate-400'}`}>{t}</button>
                  ))}
                  <span className="mx-1 text-slate-600">|</span>
                  {NOMES.map((nm, d) => (
                    <button key={nm} type="button" disabled={disabled} onClick={() => mudarPeriodo(i, { dias: p.dias.includes(d) ? p.dias.filter(x => x !== d) : [...p.dias, d] })}
                      className={`w-8 py-0.5 rounded-full border text-[9px] font-bold ${p.dias.includes(d) ? 'border-emerald-400 text-emerald-300 bg-emerald-500/15' : 'border-white/10 text-slate-500'}`}>{nm}</button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-400">{n} dia{n === 1 ? '' : 's'} × {p.porDia} = <b className="text-white">{n * p.porDia}</b> inserções</p>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button type="button" disabled={disabled} onClick={() => {
              const ult = dist.periodos[dist.periodos.length - 1];
              const ini = new Date(dataLocal(ult.fim)); ini.setDate(ini.getDate() + 1);
              const fim = new Date(ini); fim.setDate(fim.getDate() + 29);
              mudar({ ...dist, periodos: [...dist.periodos, { inicio: ini.toLocaleDateString('en-CA'), fim: fim.toLocaleDateString('en-CA'), dias: [...ult.dias], porDia: ult.porDia }] });
            }} className="text-[9px] font-black uppercase text-sky-400 flex items-center gap-1"><Plus size={10} /> Adicionar outro período</button>
            <label className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-500">Avulsas
              <input type="number" min={0} max={9999} value={dist.avulsa || 0} disabled={disabled} onChange={e => mudar({ ...dist, avulsa: Math.max(0, Number(e.target.value) || 0) })} className={`${inp} w-14 text-center`} /></label>
          </div>
          <button type="button" disabled={disabled} onClick={() => mudar(null)} className="text-[9px] text-slate-500 hover:text-red-400">Tirar distribuição (digitar quantidade)</button>
        </>
      )}
    </div>
  );
}
