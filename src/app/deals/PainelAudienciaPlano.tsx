"use client";
import { useEffect, useMemo, useState } from 'react';
import { Radio, Users, Target, Coins, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { calcularPlano, DIAS, FONTES, melhoresFaixas, type DiaTipo, type Faixa, type ItemPlano, type Pesquisa } from '@/lib/audiencia';

// Audiência do plano dentro da proposta: usa a pesquisa mais recente da emissora (tela
// /audiencia) e mostra quantas pessoas o plano impacta, os pontos de audiência e o custo por mil.
// Só aparece quando a emissora tem pesquisa cadastrada.

const fmt = (v: number | null, d = 0) => v === null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d });
const brl = (v: number | null) => v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export default function PainelAudienciaPlano({ empresaId, unidade, itens, valorTotal }: { empresaId?: string; unidade: string; itens: ItemPlano[]; valorTotal: number }) {
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [dia, setDia] = useState<DiaTipo>('seg_sex');

  useEffect(() => {
    if (!empresaId || !unidade) { setPesquisa(null); return; }
    let cancelado = false;
    (async () => {
      const { data: p } = await supabase.from('audiencia_pesquisas').select('*').eq('empresa_id', empresaId).eq('unidade', unidade)
        .order('periodo_fim', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (cancelado) return;
      setPesquisa((p as Pesquisa) || null);
      if (!p) { setFaixas([]); return; }
      const { data: f } = await supabase.from('audiencia_faixas').select('dia_tipo, hora_inicio, hora_fim, ouvintes_minuto, audiencia_pct, share_pct, alcance').eq('pesquisa_id', p.id).limit(500);
      if (cancelado) return;
      const fx = ((f || []) as any[]).map(x => ({ ...x, hora_inicio: String(x.hora_inicio).slice(0, 5), hora_fim: String(x.hora_fim).slice(0, 5) })) as Faixa[];
      setFaixas(fx);
      if (fx.length && !fx.some(x => x.dia_tipo === 'seg_sex')) setDia(fx[0].dia_tipo);
    })();
    return () => { cancelado = true; };
  }, [empresaId, unidade]);

  const plano = useMemo(() => calcularPlano(itens, faixas, valorTotal, dia), [itens, faixas, valorTotal, dia]);
  const sugestao = useMemo(() => melhoresFaixas(faixas, dia), [faixas, dia]);
  if (!pesquisa || !faixas.length) return null;

  return (
    <div className="mt-3 bg-[rgb(var(--cor-primaria-rgb)/5%)] border border-[rgb(var(--cor-primaria-rgb)/25%)] rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--cor-primaria)] flex items-center gap-1.5"><Radio size={12} /> Audiência do plano</p>
        <select value={dia} onChange={e => setDia(e.target.value as DiaTipo)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold text-white outline-none">
          {(Object.keys(DIAS) as DiaTipo[]).filter(d => faixas.some(f => f.dia_tipo === d) || d === dia).map(d => <option key={d} value={d} className="bg-[#0B1120]">{DIAS[d]}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          [<Users key="u" size={11} />, 'Impactos', fmt(plano.impactos)],
          [<Target key="t" size={11} />, 'Pontos de audiência (GRP)', fmt(plano.grp, 1)],
          [<Coins key="c" size={11} />, 'Custo por mil impactos', brl(plano.cpm)],
          [<Coins key="p" size={11} />, 'Custo por ponto', brl(plano.cpp)],
        ].map(([ic, l, v], i) => (
          <div key={i} className="bg-black/30 border border-white/5 rounded-xl p-2.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">{ic}{l}</p>
            <p className="text-sm font-black text-white tabular-nums">{v as string}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {plano.linhas.map((l, i) => (
          <div key={i} className="flex items-center justify-between text-[10px] text-slate-400 gap-2">
            <span className="truncate">{l.insercoes}× {l.servico} · {l.janela}</span>
            <span className="tabular-nums shrink-0">{l.opm !== null ? `${fmt(l.opm)} ouvintes/min · ${fmt(l.impactos)} impactos` : 'sem dado nessa faixa'}</span>
          </div>
        ))}
      </div>
      {sugestao.length > 0 && (
        <p className="text-[10px] text-slate-300 flex items-start gap-1.5"><Sparkles size={11} className="text-[var(--cor-primaria)] mt-0.5 shrink-0" />
          Horários de maior audiência ({DIAS[dia]}): {sugestao.map(f => `${f.hora_inicio}–${f.hora_fim} (${fmt(f.ouvintes_minuto)}/min)`).join(' · ')}</p>
      )}
      <p className="text-[9px] text-slate-500">Fonte: {pesquisa.instituto || FONTES[pesquisa.fonte]}{pesquisa.praca ? ` · ${pesquisa.praca}` : ''} · {pesquisa.publico}{pesquisa.periodo_fim ? ` · até ${new Date(pesquisa.periodo_fim + 'T12:00').toLocaleDateString('pt-BR')}` : ''}. Impactos = ouvintes por minuto da faixa × inserções.</p>
    </div>
  );
}
