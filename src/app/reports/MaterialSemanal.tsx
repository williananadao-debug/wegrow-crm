"use client";
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { ChevronLeft, ChevronRight, Download, X, CalendarDays, Users, TrendingUp, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';

const getLocalYYYYMMDD = (date: Date) => {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Segunda-feira da semana que contém `date` — semana sempre Seg→Dom, igual o calendário
// que a rádio já usa pra fechar a semana de vendas.
function segundaDaSemanaDe(date: Date) {
  const d = new Date(date); const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0);
  return d;
}

const DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// Verde primeiro (marca), depois cores que ainda leem bem tanto no card escuro quanto
// no PDF fundo branco — cicla se tiver mais filiais do que cores.
const CORES_FILIAL = ['#22C55E', '#3B82F6', '#F59E0B', '#A855F7', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];

function formatarPeriodo(inicio: Date, fim: Date) {
  const mesmoMes = inicio.getMonth() === fim.getMonth();
  const mesFim = fim.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const mesIni = inicio.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return mesmoMes
    ? `${inicio.getDate()} – ${fim.getDate()} de ${mesFim}`
    : `${inicio.getDate()} ${mesIni} – ${fim.getDate()} ${mesFim}`;
}

function pctVar(atual: number, anterior: number) {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

type Registro = { id: number; created_at: string; unidade?: string | null; valor_total?: number; user_id?: string };

export function MaterialSemanal() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isDirector = perfil?.cargo === 'diretor';
  const isGerente = perfil?.cargo === 'gerente';

  const [segunda, setSegunda] = useState(() => segundaDaSemanaDe(new Date()));
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [vendasAtual, setVendasAtual] = useState<Registro[]>([]);
  const [vendasAnterior, setVendasAnterior] = useState<Registro[]>([]);
  const [visitasAtual, setVisitasAtual] = useState<Registro[]>([]);
  const [visitasAnterior, setVisitasAnterior] = useState<Registro[]>([]);

  const domingo = useMemo(() => { const d = new Date(segunda); d.setDate(d.getDate() + 6); return d; }, [segunda]);
  const segundaAnt = useMemo(() => { const d = new Date(segunda); d.setDate(d.getDate() - 7); return d; }, [segunda]);
  const domingoAnt = useMemo(() => { const d = new Date(segundaAnt); d.setDate(d.getDate() + 6); return d; }, [segundaAnt]);
  const ehSemanaAtual = useMemo(() => segundaDaSemanaDe(new Date()).getTime() === segunda.getTime(), [segunda]);

  useEffect(() => {
    if (!exportando) return;
    // MaterialSemanal é um componente filho dentro de /reports — só esconder o próprio
    // conteúdo não basta, a barra de filtros da página-mãe continua no DOM e vaza pro
    // print. Marca o body pra a regra em globals.css esconder tudo, exceto este overlay
    // (renderizado via portal direto no body, fora da árvore da página).
    document.body.classList.add('modo-exportacao-isolada');
    const t = setTimeout(() => window.print(), 80);
    const voltar = () => setExportando(false);
    window.addEventListener('afterprint', voltar);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', voltar);
      document.body.classList.remove('modo-exportacao-isolada');
    };
  }, [exportando]);

  useEffect(() => { if (user && perfil) carregar(); }, [user, perfil, segunda]);

  async function buscarPeriodo(inicio: Date, fim: Date, tabela: 'leads' | 'visitas'): Promise<Registro[]> {
    const iniStr = getLocalYYYYMMDD(inicio);
    const fimStr = getLocalYYYYMMDD(fim);
    const campos = tabela === 'leads' ? 'id, valor_total, status, unidade, user_id, created_at' : 'id, user_id, unidade, created_at';
    const base = () => {
      let q = supabase.from(tabela).select(campos).gte('created_at', iniStr + 'T00:00:00').lte('created_at', fimStr + 'T23:59:59').limit(3000);
      if (perfil?.empresa_id) q = q.eq('empresa_id', perfil.empresa_id);
      if (tabela === 'leads') q = q.eq('status', 'ganho');
      return q;
    };
    if (isGerente && perfil?.unidade) {
      const [a, b] = await Promise.all([base().eq('unidade', perfil.unidade), base().eq('user_id', user?.id)]);
      const porId = new Map<number, any>();
      [...(a.data || []), ...(b.data || [])].forEach((r: any) => porId.set(r.id, r));
      return Array.from(porId.values());
    }
    if (!isDirector) { const { data } = await base().eq('user_id', user?.id); return (data as any) || []; }
    const { data } = await base();
    return (data as any) || [];
  }

  async function carregar() {
    setLoading(true);
    try {
      const [va, vp, visA, visP] = await Promise.all([
        buscarPeriodo(segunda, domingo, 'leads'),
        buscarPeriodo(segundaAnt, domingoAnt, 'leads'),
        buscarPeriodo(segunda, domingo, 'visitas'),
        buscarPeriodo(segundaAnt, domingoAnt, 'visitas'),
      ]);
      setVendasAtual(va); setVendasAnterior(vp); setVisitasAtual(visA); setVisitasAnterior(visP);
    } catch (e) {
      console.error('[MaterialSemanal]', e);
    } finally {
      setLoading(false);
    }
  }

  const { porDia, totalSemana, totalCount, faturamentoAnterior, porFilial } = useMemo(() => {
    const dias = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(segunda); d.setDate(d.getDate() + i);
      return { data: getLocalYYYYMMDD(d), label: DIAS_LABEL[i], total: 0, count: 0 };
    });
    const porDiaMap = Object.fromEntries(dias.map(d => [d.data, d]));
    vendasAtual.forEach(v => {
      const dia = v.created_at?.substring(0, 10);
      if (porDiaMap[dia]) { porDiaMap[dia].total += Number(v.valor_total || 0); porDiaMap[dia].count += 1; }
    });
    const totalSemana = vendasAtual.reduce((s, v) => s + Number(v.valor_total || 0), 0);
    const faturamentoAnterior = vendasAnterior.reduce((s, v) => s + Number(v.valor_total || 0), 0);

    const filialAtualMap: Record<string, { nome: string; total: number; count: number }> = {};
    vendasAtual.forEach(v => {
      const nome = v.unidade || 'Sem unidade';
      (filialAtualMap[nome] ||= { nome, total: 0, count: 0 });
      filialAtualMap[nome].total += Number(v.valor_total || 0);
      filialAtualMap[nome].count += 1;
    });
    const filialAnteriorMap: Record<string, number> = {};
    vendasAnterior.forEach(v => {
      const nome = v.unidade || 'Sem unidade';
      filialAnteriorMap[nome] = (filialAnteriorMap[nome] || 0) + Number(v.valor_total || 0);
    });
    const porFilial = Object.values(filialAtualMap)
      .map(f => ({ ...f, variacao: pctVar(f.total, filialAnteriorMap[f.nome] || 0) }))
      .sort((a, b) => b.total - a.total);

    return { porDia: dias, totalSemana, totalCount: vendasAtual.length, faturamentoAnterior, porFilial };
  }, [vendasAtual, vendasAnterior, segunda]);

  const maxDia = Math.max(1, ...porDia.map(d => d.total), totalSemana / 7);
  const maxFilial = Math.max(1, ...porFilial.map(f => f.total));

  const RAIO_DONUT = 60;
  const CIRC_DONUT = 2 * Math.PI * RAIO_DONUT;
  const donutSegmentos = useMemo(() => {
    let acumulado = 0;
    return porFilial.map((f, i) => {
      const fracao = totalSemana > 0 ? f.total / totalSemana : 0;
      const comprimento = fracao * CIRC_DONUT;
      const seg = { nome: f.nome, cor: CORES_FILIAL[i % CORES_FILIAL.length], comprimento, offset: -acumulado, pct: fracao * 100 };
      acumulado += comprimento;
      return seg;
    });
  }, [porFilial, totalSemana]);

  const visitasWoW = pctVar(visitasAtual.length, visitasAnterior.length);
  const vendasWoW = pctVar(totalCount, vendasAnterior.length);
  const faturamentoWoW = pctVar(totalSemana, faturamentoAnterior);

  const periodoLabel = formatarPeriodo(segunda, domingo);

  const conteudo = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-2xl p-4 border ${exportando ? 'bg-slate-50 border-slate-200' : 'bg-[#0F172A] border-white/5'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${exportando ? 'text-slate-500' : 'text-slate-500'}`}><Users size={11}/> Visitas</p>
          <div className="flex items-end gap-2">
            <h3 className={`text-2xl font-black italic tracking-tighter ${exportando ? 'text-slate-900' : 'text-white'}`}>{visitasAtual.length}</h3>
            <span className={`flex items-center text-[10px] font-black px-1.5 py-0.5 rounded-lg mb-1 ${visitasWoW >= 0 ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-red-500/10 text-red-500'}`}>
              {visitasWoW >= 0 ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}{Math.abs(Math.round(visitasWoW))}%
            </span>
          </div>
          <p className={`text-[10px] mt-1 ${exportando ? 'text-slate-400' : 'text-slate-600'}`}>vs. {visitasAnterior.length} na semana anterior</p>
        </div>
        <div className={`rounded-2xl p-4 border ${exportando ? 'bg-slate-50 border-slate-200' : 'bg-[#0F172A] border-white/5'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${exportando ? 'text-slate-500' : 'text-slate-500'}`}><TrendingUp size={11}/> Vendas</p>
          <div className="flex items-end gap-2">
            <h3 className={`text-2xl font-black italic tracking-tighter ${exportando ? 'text-slate-900' : 'text-[#22C55E]'}`}>{totalCount}</h3>
            <span className={`flex items-center text-[10px] font-black px-1.5 py-0.5 rounded-lg mb-1 ${vendasWoW >= 0 ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-red-500/10 text-red-500'}`}>
              {vendasWoW >= 0 ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}{Math.abs(Math.round(vendasWoW))}%
            </span>
          </div>
          <p className={`text-[10px] mt-1 ${exportando ? 'text-slate-400' : 'text-slate-600'}`}>R$ {totalSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({faturamentoWoW >= 0 ? '+' : ''}{Math.round(faturamentoWoW)}% em R$)</p>
        </div>
      </div>

      <div className={`rounded-2xl p-5 border mt-3 ${exportando ? 'bg-slate-50 border-slate-200' : 'bg-[#0F172A] border-white/5'}`}>
        <p className={`text-[9px] font-black uppercase tracking-widest mb-4 ${exportando ? 'text-slate-500' : 'text-slate-500'}`}>Volume de vendas por dia</p>
        <div className="flex items-end gap-2 h-32">
          {porDia.map(d => (
            <div key={d.data} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
              <span className={`text-[9px] font-black ${exportando ? 'text-slate-500' : 'text-slate-500'}`}>{d.count > 0 ? d.count : ''}</span>
              <div className="w-full rounded-t-md bg-[#22C55E]" style={{ height: `${Math.max(3, (d.total / maxDia) * 100)}%` }} />
              <span className={`text-[9px] font-black uppercase ${exportando ? 'text-slate-500' : 'text-slate-500'}`}>{d.label}</span>
            </div>
          ))}
          <div className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 pl-2 border-l border-dashed border-white/10 ml-1">
            <span className={`text-[9px] font-black ${exportando ? 'text-slate-500' : 'text-slate-500'}`}>{totalCount}</span>
            <div className={`w-full rounded-t-md ${exportando ? 'bg-slate-800' : 'bg-white'}`} style={{ height: `${Math.max(3, (totalSemana / maxDia) * 100)}%` }} />
            <span className={`text-[9px] font-black uppercase ${exportando ? 'text-slate-900' : 'text-white'}`}>Total</span>
          </div>
        </div>
      </div>

      {porFilial.length > 0 && (
        <div className={`rounded-2xl p-5 border mt-3 ${exportando ? 'bg-slate-50 border-slate-200' : 'bg-[#0F172A] border-white/5'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest mb-4 ${exportando ? 'text-slate-500' : 'text-slate-500'}`}>Vendas por filial</p>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="relative w-32 h-32 shrink-0">
              <svg viewBox="0 0 160 160" className="w-32 h-32 -rotate-90">
                {donutSegmentos.map(seg => (
                  <circle
                    key={seg.nome}
                    cx={80} cy={80} r={RAIO_DONUT}
                    fill="none"
                    stroke={seg.cor}
                    strokeWidth={22}
                    strokeDasharray={`${seg.comprimento} ${CIRC_DONUT - seg.comprimento}`}
                    strokeDashoffset={seg.offset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-[8px] font-black uppercase tracking-widest ${exportando ? 'text-slate-400' : 'text-slate-500'}`}>Total</span>
                <span className={`text-[11px] font-black ${exportando ? 'text-slate-900' : 'text-white'}`}>R$ {totalSemana.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="flex-1 w-full space-y-3">
            {porFilial.map((f, i) => (
              <div key={f.nome}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-bold flex items-center gap-1.5 ${exportando ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CORES_FILIAL[i % CORES_FILIAL.length] }} />
                    {f.nome}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black ${exportando ? 'text-slate-900' : 'text-white'}`}>R$ {f.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span className={`flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-md ${f.variacao >= 0 ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-red-500/10 text-red-500'}`}>
                      {f.variacao >= 0 ? <ArrowUpRight size={9}/> : <ArrowDownRight size={9}/>}{Math.abs(Math.round(f.variacao))}%
                    </span>
                  </div>
                </div>
                <div className={`w-full h-2.5 rounded-full overflow-hidden ${exportando ? 'bg-slate-100' : 'bg-white/5'}`}>
                  <div className="h-full rounded-full" style={{ width: `${(f.total / maxFilial) * 100}%`, background: CORES_FILIAL[i % CORES_FILIAL.length] }} />
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (exportando && typeof document !== 'undefined') {
    return createPortal(
      <div className="export-overlay-isolada fixed inset-0 z-[9999] bg-white text-slate-900 overflow-y-auto p-10 print:p-6 print:static print:overflow-visible">
        <button onClick={() => setExportando(false)} className="print:hidden fixed top-4 right-4 p-2 rounded-lg hover:bg-slate-100 text-slate-500 z-10" title="Fechar">
          <X size={18}/>
        </button>
        <div className="max-w-xl mx-auto">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{empresa?.nome || 'Wegrow'}</p>
          <h2 className="text-lg font-black uppercase italic tracking-tighter mb-1">Material Semanal de Vendas</h2>
          <p className="text-slate-400 text-[10px] mb-6">{periodoLabel} de {domingo.getFullYear()}</p>
          {conteudo}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="bg-[#0B1120] border border-white/5 rounded-[32px] p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-black uppercase italic flex items-center gap-2">
          <CalendarDays size={18} className="text-[#22C55E]" /> Material Semanal
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setSegunda(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 transition-colors" title="Semana anterior">
            <ChevronLeft size={16}/>
          </button>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-center">{periodoLabel}</span>
          <button onClick={() => setSegunda(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} disabled={ehSemanaAtual} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Próxima semana">
            <ChevronRight size={16}/>
          </button>
          <button onClick={() => setExportando(true)} disabled={loading} className="ml-2 p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors disabled:opacity-40" title="Baixar PDF (fundo branco, pronto pra apresentação)">
            <Download size={15}/>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-600"/></div>
      ) : conteudo}
    </div>
  );
}
