"use client";
import { useState, useEffect, useMemo } from 'react';
import { Users, TrendingUp, AlertTriangle, CheckCircle2, BarChart3, RefreshCw, Loader2, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { SkeletonPage } from '@/components/Skeleton';

type Associado = {
  id: number;
  empresa: string;
  tipo: string;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  valor_total: number;
  unidade: string;
  descricao: string | null;
  created_at: string;
};

function extrairSegmento(descricao: string | null): string {
  if (!descricao) return 'Não informado';
  const match = descricao.match(/Segmento:\s*([^\n]+)/);
  return match ? match[1].trim() : 'Não informado';
}

export default function AssociadosPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isCDL = Boolean(empresa?.modulos?.cdl);

  const [associados, setAssociados] = useState<Associado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (perfil?.empresa_id) carregar();
  }, [perfil?.empresa_id]);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('id, empresa, tipo, contrato_inicio, contrato_fim, valor_total, unidade, descricao, created_at')
      .eq('empresa_id', perfil?.empresa_id)
      .eq('status', 'ganho')
      .order('empresa', { ascending: true })
      .limit(2000);
    setAssociados((data || []) as Associado[]);
    setLoading(false);
  };

  const hoje = new Date().toISOString().substring(0, 10);

  const { ativos, inadimplentes, totalReceita, porSegmento, crescimentoMensal, taxaRenovacao } = useMemo(() => {
    const ativos = associados.filter(a => !a.contrato_fim || a.contrato_fim >= hoje);
    const inadimplentes = associados.filter(a => a.contrato_fim && a.contrato_fim < hoje);
    const totalReceita = ativos.reduce((s, a) => s + (a.valor_total || 0), 0);

    const seg: Record<string, number> = {};
    ativos.forEach(a => {
      const s = extrairSegmento(a.descricao);
      seg[s] = (seg[s] || 0) + 1;
    });
    const porSegmento = Object.entries(seg).sort((a, b) => b[1] - a[1]);

    const meses: Record<string, number> = {};
    associados.forEach(a => {
      const m = a.created_at.substring(0, 7);
      meses[m] = (meses[m] || 0) + 1;
    });
    const crescimentoMensal = Object.entries(meses).sort(([a], [b]) => a.localeCompare(b)).slice(-6);

    const total = associados.length;
    const taxaRenovacao = total > 0 ? Math.round((ativos.length / total) * 100) : 0;

    return { ativos, inadimplentes, totalReceita, porSegmento, crescimentoMensal, taxaRenovacao };
  }, [associados, hoje]);

  const associadosFiltrados = useMemo(() => {
    if (!busca.trim()) return ativos;
    const q = busca.toLowerCase();
    return ativos.filter(a => a.empresa.toLowerCase().includes(q) || (a.tipo || '').toLowerCase().includes(q));
  }, [ativos, busca]);

  if (loading) return (
    <div className="p-4 md:p-8"><SkeletonPage /></div>
  );

  return (
    <div className="p-4 md:p-8 pb-20 text-white animate-in fade-in duration-500">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
            <Users size={32}/> {isCDL ? 'Base de Associados' : 'Base de Clientes'}
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            Painel de saúde da base · {associados.length} registros totais
          </p>
        </div>
        <button onClick={carregar} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
          <RefreshCw size={14}/> Atualizar
        </button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: isCDL ? 'Associados Ativos' : 'Clientes Ativos', value: ativos.length, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/5 border-[#22C55E]/20', icon: <CheckCircle2 size={18} className="text-[#22C55E]"/> },
          { label: 'Inadimplentes', value: inadimplentes.length, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20', icon: <AlertTriangle size={18} className="text-red-400"/> },
          { label: 'Taxa de Retenção', value: `${taxaRenovacao}%`, color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/20', icon: <TrendingUp size={18} className="text-blue-400"/> },
          { label: isCDL ? 'Receita Anuidades' : 'Receita Base', value: `R$ ${(totalReceita / 1000).toFixed(0)}k`, color: 'text-purple-400', bg: 'bg-purple-500/5 border-purple-500/20', icon: <BarChart3 size={18} className="text-purple-400"/> },
        ].map(({ label, value, color, bg, icon }) => (
          <div key={label} className={`${bg} border p-5 rounded-2xl`}>
            {icon}
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">{label}</p>
            <h2 className={`text-2xl font-black mt-0.5 ${color}`}>{value}</h2>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Por Segmento */}
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
          <h3 className="font-black uppercase text-sm text-slate-300 mb-4 flex items-center gap-2"><Tag size={14}/> Por Segmento</h3>
          {porSegmento.length === 0 ? (
            <p className="text-slate-500 text-xs font-bold text-center py-4">Sem dados de segmento</p>
          ) : (
            <div className="space-y-2">
              {porSegmento.slice(0, 8).map(([seg, count]) => {
                const pct = ativos.length > 0 ? Math.round((count / ativos.length) * 100) : 0;
                return (
                  <div key={seg} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[10px] font-black text-slate-300 truncate">{seg}</span>
                        <span className="text-[10px] font-black text-slate-500 ml-2 shrink-0">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[#22C55E] rounded-full transition-all" style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Crescimento Mensal */}
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
          <h3 className="font-black uppercase text-sm text-slate-300 mb-4 flex items-center gap-2"><TrendingUp size={14}/> Novos por Mês</h3>
          {crescimentoMensal.length === 0 ? (
            <p className="text-slate-500 text-xs font-bold text-center py-4">Sem histórico</p>
          ) : (
            <div className="space-y-2">
              {crescimentoMensal.map(([mes, count]) => {
                const max = Math.max(...crescimentoMensal.map(([, c]) => c));
                const pct = max > 0 ? Math.round((count / max) * 100) : 0;
                const [ano, m] = mes.split('-');
                const label = new Date(`${mes}-01`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                return (
                  <div key={mes} className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-500 w-14 shrink-0 uppercase">{label}</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                    </div>
                    <span className="text-[10px] font-black text-slate-300 w-6 text-right shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <h3 className="font-black uppercase text-sm text-slate-300">{isCDL ? 'Associados Ativos' : 'Clientes Ativos'} ({ativos.length})</h3>
          <input
            type="text"
            placeholder="Buscar por nome ou tipo..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs font-semibold outline-none focus:border-[#22C55E] w-full md:w-64"
          />
        </div>
        {associadosFiltrados.length === 0 ? (
          <div className="p-10 text-center">
            <Users size={32} className="text-slate-600 mx-auto mb-2"/>
            <p className="text-slate-500 text-sm font-bold">{busca ? 'Nenhum resultado.' : 'Nenhum associado ativo.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {associadosFiltrados.map(a => {
              const diasParaVencer = a.contrato_fim
                ? Math.floor((new Date(a.contrato_fim + 'T00:00:00').getTime() - Date.now()) / 86400000)
                : null;
              return (
                <div key={a.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 hover:bg-white/[0.02] transition-colors">
                  <div className="min-w-0">
                    <p className="font-black text-white uppercase text-sm truncate">{a.empresa}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {a.tipo && <span className="text-[9px] font-black bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 px-1.5 py-0.5 rounded">{a.tipo}</span>}
                      <span className="text-[9px] text-slate-500">{a.unidade}</span>
                      <span className="text-[9px] text-slate-500">{extrairSegmento(a.descricao)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-[#22C55E] font-black text-sm">R$ {(a.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                      {a.contrato_fim && (
                        <p className={`text-[9px] font-bold ${diasParaVencer !== null && diasParaVencer <= 30 ? 'text-yellow-400' : 'text-slate-500'}`}>
                          Vence {new Date(a.contrato_fim + 'T00:00:00').toLocaleDateString('pt-BR')}
                          {diasParaVencer !== null && diasParaVencer <= 30 && ` (${diasParaVencer}d)`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
