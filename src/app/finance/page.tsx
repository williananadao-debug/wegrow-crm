"use client";
import { useState, useEffect, useMemo } from 'react';
import {
  Plus, TrendingUp, AlertTriangle, FileText, Barcode,
  DollarSign, CheckCircle2, Clock, Filter, Loader2, X, RefreshCw
} from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnidades } from '@/lib/useUnidades';

// ==========================================
// FINANCEIRO (CDL e Padrão unificados)
// ==========================================
function FinanceiroPadrao({ isCDL }: { isCDL: boolean }) {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const { unidades } = useUnidades(perfil?.empresa_id);

  type LeadFinance = { id: string; empresa: string; valor_total: number; status: string; unidade: string; contrato_inicio: string | null; contrato_fim: string | null; data_pagamento: string | null; created_at: string; };
  const [aba, setAba] = useState<'inadimplencia' | 'conciliacao'>('inadimplencia');
  const [leads, setLeads] = useState<LeadFinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Filtros inadimplência
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [filtroDias, setFiltroDias] = useState('0');

  // Filtros conciliação
  const [mesConciliacao, setMesConciliacao] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (perfil?.empresa_id) carregarLeads();
  }, [perfil?.empresa_id]);

  const carregarLeads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('id, empresa, valor_total, status, unidade, contrato_inicio, contrato_fim, data_pagamento, created_at')
      .eq('empresa_id', perfil?.empresa_id)
      .eq('status', 'ganho')
      .not('contrato_fim', 'is', null)
      .order('contrato_fim', { ascending: true })
      .limit(1000);
    setLeads((data || []) as LeadFinance[]);
    setLoading(false);
  };

  const hoje = new Date().toISOString().substring(0, 10);

  const inadimplentes = useMemo(() => {
    return leads
      .filter(l => l.contrato_fim != null && l.contrato_fim < hoje)
      .map(l => ({
        ...l,
        diasVencido: Math.floor((Date.now() - new Date((l.contrato_fim as string) + 'T00:00:00').getTime()) / 86400000),
      }))
      .filter(l => l.diasVencido >= Number(filtroDias))
      .filter(l => !filtroUnidade || l.unidade === filtroUnidade);
  }, [leads, hoje, filtroDias, filtroUnidade]);

  const [anoMes, mesNum] = mesConciliacao.split('-');
  const conciliacaoLeads = useMemo(() => {
    return leads.filter(l => {
      const cf = l.contrato_fim?.substring(0, 7);
      const ci = l.contrato_inicio?.substring(0, 7);
      return cf === mesConciliacao || ci === mesConciliacao;
    });
  }, [leads, mesConciliacao]);

  const totalInadimplente = inadimplentes.reduce((s, l) => s + (l.valor_total || 0), 0);
  const totalContratos = leads.filter(l => l.contrato_fim != null && l.contrato_fim >= hoje).length;
  const taxaInadimplencia = leads.length > 0 ? Math.round((inadimplentes.length / leads.length) * 100) : 0;

  const totalEsperado = conciliacaoLeads.reduce((s, l) => s + (l.valor_total || 0), 0);
  const totalRecebido = conciliacaoLeads.filter(l => l.data_pagamento).reduce((s, l) => s + (l.valor_total || 0), 0);
  const totalPendente = totalEsperado - totalRecebido;

  const darBaixa = async (id: string) => {
    setSalvando(id);
    await supabase.from('leads').update({ data_pagamento: hoje }).eq('id', id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, data_pagamento: hoje } : l));
    setSalvando(null);
  };

  const estornarBaixa = async (id: string) => {
    setSalvando(id);
    await supabase.from('leads').update({ data_pagamento: null }).eq('id', id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, data_pagamento: null } : l));
    setSalvando(null);
  };

  const renovarContrato = async (id: string, contrato_fim: string) => {
    const novaData = new Date(contrato_fim + 'T00:00:00');
    novaData.setFullYear(novaData.getFullYear() + 1);
    const novaDataStr = novaData.toISOString().substring(0, 10);
    setSalvando(id);
    await supabase.from('leads').update({ contrato_fim: novaDataStr }).eq('id', id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, contrato_fim: novaDataStr } : l));
    setSalvando(null);
  };

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
            <DollarSign size={32}/> Financeiro
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            {isCDL ? 'Inadimplência de Anuidades e conciliação' : 'Inadimplência e conciliação de contratos'}
          </p>
        </div>
      </header>

      {/* Abas */}
      <div className="flex gap-2 mb-6 border-b border-white/5 pb-4">
        {([['inadimplencia', 'Inadimplência', AlertTriangle], ['conciliacao', 'Conciliação', CheckCircle2]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${aba === key ? 'bg-[#22C55E] text-[#0B1120]' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            <Icon size={14}/> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonPage />
      ) : aba === 'inadimplencia' ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-red-500/10 border border-red-500/30 p-5 rounded-2xl">
              <AlertTriangle className="text-red-500 mb-2" size={20}/>
              <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Taxa de Inadimplência</p>
              <h2 className="text-3xl font-black text-white mt-1">{taxaInadimplencia}%</h2>
              <p className="text-[10px] text-red-400/60 mt-0.5">{inadimplentes.length} {isCDL ? 'anuidades vencidas' : 'contratos vencidos'}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 p-5 rounded-2xl">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Volume Inadimplente</p>
              <h2 className="text-2xl font-black text-red-400 mt-1">R$ {totalInadimplente.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">potencial de renovação</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 p-5 rounded-2xl">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{isCDL ? 'Associados Adimplentes' : 'Contratos Ativos'}</p>
              <h2 className="text-2xl font-black text-[#22C55E] mt-1">{totalContratos}</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">{isCDL ? 'anuidade em dia' : 'vencimento futuro'}</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3 mb-5 bg-[#0F172A] border border-white/10 rounded-2xl p-4">
            <Filter size={14} className="text-slate-500"/>
            <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none">
              <option value="">Todas as unidades</option>
              {unidades.map(u => <option key={u.id} value={u.nome}>{u.nome}</option>)}
            </select>
            <select value={filtroDias} onChange={e => setFiltroDias(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none">
              <option value="0">Todos os vencidos</option>
              <option value="30">+30 dias</option>
              <option value="60">+60 dias</option>
              <option value="90">+90 dias</option>
            </select>
            {(filtroUnidade || filtroDias !== '0') && (
              <button onClick={() => { setFiltroUnidade(''); setFiltroDias('0'); }} className="text-slate-500 hover:text-white flex items-center gap-1 text-xs"><X size={12}/> Limpar</button>
            )}
          </div>

          {/* Tabela */}
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="font-black uppercase text-sm text-slate-300">{isCDL ? 'Anuidades Vencidas' : 'Contratos Vencidos'} ({inadimplentes.length})</h3>
            </div>
            {inadimplentes.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 size={32} className="text-[#22C55E] mx-auto mb-2"/>
                <p className="text-slate-500 text-sm font-bold">Nenhum contrato vencido com os filtros atuais.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {inadimplentes.map(l => (
                  <div key={l.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="font-black text-white uppercase truncate">{l.empresa}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[9px] text-slate-500">{l.unidade}</span>
                        <span className="text-[9px] text-slate-600">Venceu: {new Date(l.contrato_fim + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded ${l.diasVencido > 90 ? 'bg-red-500/20 text-red-400' : l.diasVencido > 30 ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {l.diasVencido}d atraso
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-black text-white">R$ {(l.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                      <button
                        onClick={() => renovarContrato(l.id, l.contrato_fim as string)}
                        disabled={salvando === l.id}
                        className="bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1"
                      >
                        {salvando === l.id ? <Loader2 size={10} className="animate-spin"/> : <RefreshCw size={10}/>}
                        {isCDL ? 'Renovar Anuidade' : 'Renovar +1 ano'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Filtro mês conciliação */}
          <div className="flex items-center gap-3 mb-5 bg-[#0F172A] border border-white/10 rounded-2xl p-4">
            <Clock size={14} className="text-slate-500"/>
            <input
              type="month"
              value={mesConciliacao}
              onChange={e => setMesConciliacao(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none"
            />
          </div>

          {/* KPIs conciliação */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Esperado', value: totalEsperado, color: 'text-white', bg: 'bg-[#0F172A]' },
              { label: 'Recebido', value: totalRecebido, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/5 border-[#22C55E]/20' },
              { label: 'Pendente', value: totalPendente, color: 'text-orange-400', bg: 'bg-orange-500/5 border-orange-500/20' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} border border-white/10 p-5 rounded-2xl`}>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
                <h2 className={`text-2xl font-black mt-1 ${color}`}>R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</h2>
              </div>
            ))}
          </div>

          {/* Tabela conciliação */}
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="font-black uppercase text-sm text-slate-300">Lançamentos — {new Date(mesConciliacao + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
            </div>
            {conciliacaoLeads.length === 0 ? (
              <div className="p-10 text-center">
                <DollarSign size={32} className="text-slate-600 mx-auto mb-2"/>
                <p className="text-slate-500 text-sm font-bold">Nenhum contrato neste mês.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {conciliacaoLeads.map(l => (
                  <div key={l.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="font-black text-white uppercase truncate">{l.empresa}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[9px] text-slate-500">{l.unidade}</span>
                        {l.contrato_fim && <span className="text-[9px] text-slate-600">Vence: {new Date(l.contrato_fim + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                        {l.data_pagamento && (
                          <span className="text-[9px] font-black bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30 px-2 py-0.5 rounded">
                            Pago em {new Date(l.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-black text-white">R$ {(l.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                      {l.data_pagamento ? (
                        <button
                          onClick={() => estornarBaixa(l.id)}
                          disabled={salvando === l.id}
                          className="bg-white/5 hover:bg-white/10 text-slate-400 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1"
                        >
                          {salvando === l.id ? <Loader2 size={10} className="animate-spin"/> : <X size={10}/>} Estornar
                        </button>
                      ) : (
                        <button
                          onClick={() => darBaixa(l.id)}
                          disabled={salvando === l.id}
                          className="bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1"
                        >
                          {salvando === l.id ? <Loader2 size={10} className="animate-spin"/> : <CheckCircle2 size={10}/>} Dar Baixa
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function FinancePage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  const isCDL = Boolean(empresa?.modulos?.cdl);
  return <FinanceiroPadrao isCDL={isCDL} />;
}