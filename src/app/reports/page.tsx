"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  TrendingUp, BarChart3, PieChart, Users, 
  ArrowUpRight, ArrowDownRight, Target, Calendar,
  Download, Zap, Clock, ChevronRight, Filter, 
  ShieldCheck, Crosshair, Sparkles
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

// Barra de Progresso Customizada
const ProgressBar = ({ value, max, color }: { value: number, max: number, color: string }) => (
  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
    <div 
      className={`h-full ${color} transition-all duration-1000`} 
      style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%` }}
    />
  </div>
);

export default function ReportsPage() {
  const { user, perfil } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // Estados de Faturamento e Comparativo
  const [currentMonth, setCurrentMonth] = useState({ faturamento: 0, ticket: 0, leads: 0, conversao: 0 });
  const [lastMonth, setLastMonth] = useState({ faturamento: 0, ticket: 0, leads: 0 });
  
  const [rankingVendedores, setRankingVendedores] = useState<any[]>([]);
  const [servicosCurva, setServicosCurva] = useState<any[]>([]);
  const [estrategiasImpacto, setEstrategiasImpacto] = useState<any[]>([]);

  useEffect(() => { if (user) fetchReportData(); }, [user]);

  async function fetchReportData() {
    setLoading(true);
    try {
      const now = new Date();
      const firstDayCurrent = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const firstDayLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastDayLast = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

      // Busca Leads e Premissas (Estratégias)
      const [leadsRes, premissasRes, profilesRes] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('premissas').select('*'),
        supabase.from('profiles').select('id, nome')
      ]);

      const allLeads = leadsRes.data || [];
      const allPremissas = premissasRes.data || [];
      const allProfiles = profilesRes.data || [];

      if (allLeads.length > 0) {
        // --- CÁLCULOS MÊS ATUAL ---
        const currentLeads = allLeads.filter(l => l.created_at >= firstDayCurrent);
        const currentGanhos = currentLeads.filter(l => l.status === 'ganho');
        const fatAtual = currentGanhos.reduce((acc, curr) => acc + curr.valor_total, 0);
        
        setCurrentMonth({
          faturamento: fatAtual,
          ticket: currentGanhos.length > 0 ? fatAtual / currentGanhos.length : 0,
          leads: currentLeads.length,
          conversao: currentLeads.length > 0 ? (currentGanhos.length / currentLeads.length) * 100 : 0
        });

        // --- CÁLCULOS MÊS ANTERIOR ---
        const lastLeads = allLeads.filter(l => l.created_at >= firstDayLast && l.created_at <= lastDayLast);
        const lastGanhos = lastLeads.filter(l => l.status === 'ganho');
        const fatPassado = lastGanhos.reduce((acc, curr) => acc + curr.valor_total, 0);

        setLastMonth({
          faturamento: fatPassado,
          ticket: lastGanhos.length > 0 ? fatPassado / lastGanhos.length : 0,
          leads: lastLeads.length
        });

        // --- CURVA ABC SERVIÇOS ---
        const curve = allLeads.filter(l => l.status === 'ganho').reduce((acc: any, curr) => {
          curr.itens?.forEach((item: any) => {
            acc[item.servico] = (acc[item.servico] || 0) + (item.precoUnitario * item.quantidade);
          });
          return acc;
        }, {});
        setServicosCurva(Object.entries(curve).sort((a: any, b: any) => b[1] - a[1]));

        // --- RANKING VENDEDORES ---
        const ranking = allProfiles.map(v => {
           const vLeads = allLeads.filter(l => l.user_id === v.id);
           const vGanhos = vLeads.filter(l => l.status === 'ganho');
           return {
             nome: v.nome,
             total: vGanhos.reduce((acc, curr) => acc + curr.valor_total, 0),
             conversao: vLeads.length > 0 ? (vGanhos.length / vLeads.length) * 100 : 0
           };
        }).sort((a, b) => b.total - a.total);
        setRankingVendedores(ranking);

        // --- IMPACTO DAS ESTRATÉGIAS (Análise das Premissas) ---
        const impacto = allPremissas.map(p => {
            // Leads vinculados a esta premissa (via checkin ou titulo)
            const leadsVinculados = allLeads.filter(l => l.checkin?.includes(p.titulo) || l.checkin?.includes('Meta Gerada'));
            const ganhos = leadsVinculados.filter(l => l.status === 'ganho');
            return {
                titulo: p.titulo,
                tipo: p.tipo_cliente,
                gerados: leadsVinculados.length,
                conversao: leadsVinculados.length > 0 ? (ganhos.length / leadsVinculados.length) * 100 : 0,
                faturamento: ganhos.reduce((acc, curr) => acc + curr.valor_total, 0)
            };
        }).slice(0, 5); // Pega as 5 últimas estratégias
        setEstrategiasImpacto(impacto);
      }
    } finally { setLoading(false); }
  }

  const getGrowth = (current: number, last: number) => {
    if (last === 0) return current > 0 ? 100 : 0;
    return ((current - last) / last) * 100;
  };

  return (
    <div className="p-6 space-y-8 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER INTEGRADO */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Sala de Comando (BI)</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck size={12} className="text-blue-500"/> Análise Estratégica de Performance e Curva ABC
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchReportData} className="bg-white/5 border border-white/10 text-slate-400 p-2 rounded-xl hover:text-white transition-all">
            <Zap size={18}/>
          </button>
          <button className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-600/20">
            <Download size={14}/> Exportar Relatório
          </button>
        </div>
      </div>

      {/* COMPARATIVOS MÊS A MÊS (OS 4 PRINCIPAIS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Faturamento Mensal', current: currentMonth.faturamento, last: lastMonth.faturamento, prefix: 'R$ ', icon: TrendingUp, color: 'text-[#22C55E]' },
          { label: 'Oportunidades', current: currentMonth.leads, last: lastMonth.leads, prefix: '', icon: Target, color: 'text-blue-500' },
          { label: 'Ticket Médio', current: currentMonth.ticket, last: lastMonth.ticket, prefix: 'R$ ', icon: Zap, color: 'text-purple-500' },
          { label: 'Taxa de Conversão', current: currentMonth.conversao, last: 0, prefix: '', suffix: '%', icon: Clock, color: 'text-orange-500' },
        ].map((item, i) => {
          const growth = item.last !== undefined ? getGrowth(item.current, item.last) : 0;
          return (
            <div key={i} className="bg-[#0B1120] border border-white/5 p-6 rounded-[32px] shadow-2xl relative overflow-hidden group hover:border-white/10 transition-all">
              <item.icon className={`absolute -right-4 -top-4 w-20 h-20 opacity-5 ${item.color}`} />
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{item.label}</p>
              <div className="flex items-end gap-2">
                <h3 className={`text-2xl font-black italic tracking-tighter ${item.color}`}>
                  {item.prefix}{item.current.toLocaleString('pt-BR')}{item.suffix}
                </h3>
                {item.last > 0 && (
                   <div className={`flex items-center text-[10px] font-black px-1.5 py-0.5 rounded-lg mb-1 ${growth >= 0 ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-red-500/10 text-red-500'}`}>
                      {growth >= 0 ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}
                      {Math.abs(Math.round(growth))}%
                   </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* BLOCO CENTRAL: CURVA ABC + PERFORMANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CURVA ABC (Dobra de tamanho para destaque) */}
        <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl -mr-20 -mt-20" />
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-8 relative z-10">
            <PieChart size={20} className="text-blue-500" /> Curva ABC de Receita / Serviço
          </h3>
          
          <div className="space-y-6 relative z-10">
            {servicosCurva.length > 0 ? servicosCurva.map(([nome, valor], idx) => (
              <div key={nome}>
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <span className="text-[9px] text-slate-600 font-black uppercase">Tier {idx < 2 ? 'A' : idx < 4 ? 'B' : 'C'}</span>
                    <h4 className="text-white font-black uppercase italic text-sm">{nome}</h4>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-black text-sm">R$ {valor.toLocaleString('pt-BR')}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">Share: {Math.round((valor / currentMonth.faturamento) * 100)}%</p>
                  </div>
                </div>
                <ProgressBar value={valor} max={servicosCurva[0][1]} color={idx === 0 ? 'bg-blue-500' : 'bg-white/10'} />
              </div>
            )) : <p className="text-slate-600 text-xs italic">Aguardando dados de vendas ganhas...</p>}
          </div>
        </div>

        {/* RANKING PERMANENTE */}
        <div className="bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-8">
            <Users size={20} className="text-purple-500" /> Elite de Vendas
          </h3>
          <div className="space-y-6">
            {rankingVendedores.map((vend, idx) => (
              <div key={vend.nome} className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black italic ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-white/5 text-slate-500'}`}>
                  {idx + 1}º
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-white font-black text-xs uppercase">{vend.nome}</span>
                    <span className="text-[#22C55E] font-black text-[10px]">R$ {vend.total.toLocaleString()}</span>
                  </div>
                  <ProgressBar value={vend.total} max={rankingVendedores[0]?.total || 1} color="bg-purple-600" />
                  <p className="text-[9px] text-slate-600 font-bold mt-1 uppercase">Taxa de Conversão: {Math.round(vend.conversao)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABELA DE ESTRATÉGIAS: O DIFERENCIAL PARRUDO */}
      <div className="bg-[#0B1120] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2">
            <BarChart3 size={20} className="text-[#22C55E]" /> ROI de Estratégias (Premissas)
          </h3>
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Últimos 30 dias</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase text-slate-500 tracking-widest bg-white/[0.02]">
                <th className="px-8 py-5">Nome da Missão</th>
                <th className="px-8 py-5">Tipo</th>
                <th className="px-8 py-5 text-center">Leads</th>
                <th className="px-8 py-5 text-center">Sucesso (%)</th>
                <th className="px-8 py-5 text-right">Faturamento Real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {estrategiasImpacto.length > 0 ? estrategiasImpacto.map((est, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                        {est.titulo.includes('Resgate') ? <Sparkles size={14} className="text-purple-500"/> : <Crosshair size={14} className="text-blue-500"/>}
                        <span className="text-white font-bold text-sm uppercase italic group-hover:text-[#22C55E] transition-colors">{est.titulo}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-1 rounded-md font-black uppercase">{est.tipo || 'Vendas'}</span>
                  </td>
                  <td className="px-8 py-5 text-center text-white font-black">{est.gerados}</td>
                  <td className="px-8 py-5 text-center">
                    <div className="flex flex-col items-center">
                        <span className={`text-[10px] font-black uppercase ${est.conversao > 10 ? 'text-[#22C55E]' : 'text-slate-500'}`}>{Math.round(est.conversao)}%</span>
                        <div className="w-12 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-[#22C55E]" style={{ width: `${est.conversao}%` }} />
                        </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right text-[#22C55E] font-black italic">R$ {est.faturamento.toLocaleString('pt-BR')}</td>
                </tr>
              )) : (
                <tr>
                    <td colSpan={5} className="px-8 py-10 text-center text-slate-600 text-xs font-black uppercase">Nenhuma estratégia gerada recentemente.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}