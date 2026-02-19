"use client";
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  TrendingUp, BarChart3, PieChart, Users, 
  ArrowUpRight, ArrowDownRight, Target, Calendar,
  Download, Zap, Clock, ChevronRight, Filter, 
  ShieldCheck, Crosshair, Sparkles, Building2
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
  
  // --- ESTADOS DOS FILTROS TRIPLOS ---
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('Mês Atual'); // Padrão
  const [filtroUnidade, setFiltroUnidade] = useState<string>('Todas');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('Todos');

  // Estados Brutos (Raw Data)
  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [rawPremissas, setRawPremissas] = useState<any[]>([]);
  const [rawProfiles, setRawProfiles] = useState<any[]>([]);

  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => { 
      if (user) fetchReportData(); 
  }, [user, perfil]);

  async function fetchReportData() {
    setLoading(true);
    try {
      let leadsQuery = supabase.from('leads').select('*');
      
      if (!isDirector) {
          // Se não for diretor, traz os cards dele
          leadsQuery = leadsQuery.or(`user_id.eq.${user?.id},vendedor_nome.ilike.%${perfil?.nome}%`);
      }

      const [leadsRes, premissasRes, profilesRes] = await Promise.all([
        leadsQuery,
        supabase.from('premissas').select('*'),
        supabase.from('profiles').select('id, nome')
      ]);

      setRawLeads(leadsRes.data || []);
      setRawPremissas(premissasRes.data || []);
      setRawProfiles(profilesRes.data || []);
      
    } finally { 
        setLoading(false); 
    }
  }

  // --- FILTROS DISPONÍVEIS ---
  const unidadesDisponiveis = Array.from(new Set(rawLeads.map(l => l.unidade).filter(Boolean))) as string[];
  const vendedoresDisponiveis = Array.from(new Set(rawLeads.map(l => l.vendedor_nome).filter(Boolean))) as string[];

  // --- CÁLCULOS MEMOIZADOS E FILTRADOS ---
  const { 
      currentMonth, 
      lastMonth, 
      rankingVendedores, 
      servicosCurva, 
      estrategiasImpacto 
  } = useMemo(() => {
      
      const now = new Date();
      // Pega data inicial do ano se o filtro for "Ano Atual"
      const firstDayAnoAtual = new Date(now.getFullYear(), 0, 1).toISOString();
      const firstDayCurrent = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const firstDayLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastDayLast = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

      const nomesMap = rawProfiles.reduce((acc: any, p) => ({ ...acc, [p.id]: p.nome }), {});

      // 1. Aplica Filtros de Unidade e Vendedor na base bruta ANTES de dividir por período
      const baseFiltrada = rawLeads.filter(lead => {
          if (filtroUnidade !== 'Todas' && lead.unidade !== filtroUnidade) return false;
          if (filtroVendedor !== 'Todos' && lead.user_id !== filtroVendedor && lead.vendedor_nome !== filtroVendedor) return false;
          return true;
      });

      // 2. Filtra por Período
      let currentLeads = [];
      let pastLeads = []; // Mês anterior ou período equivalente para comparação

      if (filtroPeriodo === 'Ano Atual') {
          currentLeads = baseFiltrada.filter(l => l.created_at >= firstDayAnoAtual);
          // Comparativo do ano passado (Opcional, deixei zerado para focar no ano atual)
          pastLeads = []; 
      } else if (filtroPeriodo === 'Mês Atual') {
          currentLeads = baseFiltrada.filter(l => l.created_at >= firstDayCurrent);
          pastLeads = baseFiltrada.filter(l => l.created_at >= firstDayLast && l.created_at <= lastDayLast);
      } else if (filtroPeriodo === 'Mês Passado') {
          currentLeads = baseFiltrada.filter(l => l.created_at >= firstDayLast && l.created_at <= lastDayLast);
          // Mês retrasado para comparativo
          const firstDayRetrasado = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
          const lastDayRetrasado = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59).toISOString();
          pastLeads = baseFiltrada.filter(l => l.created_at >= firstDayRetrasado && l.created_at <= lastDayRetrasado);
      } else {
          // Todo o Período
          currentLeads = baseFiltrada;
          pastLeads = [];
      }

      // --- KPIs Período Atual ---
      const currentGanhos = currentLeads.filter(l => l.status === 'ganho');
      const fatAtual = currentGanhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0);
      
      const calcCurrent = {
        faturamento: fatAtual,
        ticket: currentGanhos.length > 0 ? fatAtual / currentGanhos.length : 0,
        leads: currentLeads.length,
        conversao: currentLeads.length > 0 ? (currentGanhos.length / currentLeads.length) * 100 : 0
      };

      // --- KPIs Período Comparativo (Anterior) ---
      const lastGanhos = pastLeads.filter(l => l.status === 'ganho');
      const fatPassado = lastGanhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0);

      const calcLast = {
        faturamento: fatPassado,
        ticket: lastGanhos.length > 0 ? fatPassado / lastGanhos.length : 0,
        leads: pastLeads.length,
        conversao: pastLeads.length > 0 ? (lastGanhos.length / pastLeads.length) * 100 : 0
      };

      // --- CURVA ABC SERVIÇOS (Baseado no Período Selecionado) ---
      const curve = currentGanhos.reduce((acc: any, curr) => {
        if (Array.isArray(curr.itens)) {
            curr.itens.forEach((item: any) => {
                acc[item.servico] = (acc[item.servico] || 0) + (item.precoUnitario * item.quantidade);
            });
        }
        return acc;
      }, {});
      const calcCurva = Object.entries(curve).sort((a: any, b: any) => b[1] - a[1]);

      // --- RANKING VENDEDORES (Baseado no Período Selecionado) ---
      const rankObj = currentLeads.reduce((acc: any, lead) => {
         const nomeVendedor = lead.vendedor_nome || nomesMap[lead.user_id] || 'Desconhecido';
         const chave = lead.vendedor_nome ? lead.vendedor_nome : (lead.user_id || 'sem_dono');

         if (!acc[chave]) acc[chave] = { id: chave, nome: nomeVendedor, total: 0, leadsCount: 0, ganhosCount: 0 };
         
         acc[chave].leadsCount += 1;
         if (lead.status === 'ganho') {
             acc[chave].total += (Number(lead.valor_total) || 0);
             acc[chave].ganhosCount += 1;
         }
         return acc;
      }, {});

      const calcRanking = Object.values(rankObj).map((v: any) => ({
          nome: v.nome,
          total: v.total,
          conversao: v.leadsCount > 0 ? (v.ganhosCount / v.leadsCount) * 100 : 0
      })).sort((a, b) => b.total - a.total);

      // --- IMPACTO DAS ESTRATÉGIAS (Baseado no Período Selecionado) ---
      const calcImpacto = rawPremissas.map(p => {
          const leadsVinculados = currentLeads.filter(l => l.checkin?.includes(p.titulo) || l.checkin?.includes('Meta Gerada'));
          const ganhos = leadsVinculados.filter(l => l.status === 'ganho');
          return {
              titulo: p.titulo,
              tipo: p.tipo_cliente,
              gerados: leadsVinculados.length,
              conversao: leadsVinculados.length > 0 ? (ganhos.length / leadsVinculados.length) * 100 : 0,
              faturamento: ganhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0)
          };
      }).filter(est => est.gerados > 0) // Só mostra as que geraram resultado no período
        .sort((a, b) => b.faturamento - a.faturamento)
        .slice(0, 5); 

      return {
          currentMonth: calcCurrent,
          lastMonth: calcLast,
          servicosCurva: calcCurva,
          rankingVendedores: calcRanking,
          estrategiasImpacto: calcImpacto
      };

  }, [rawLeads, rawPremissas, rawProfiles, filtroPeriodo, filtroUnidade, filtroVendedor]);

  const getGrowth = (current: number, last: number) => {
    if (last === 0) return current > 0 ? 100 : 0;
    return ((current - last) / last) * 100;
  };

  if (loading && !rawLeads.length) return <div className="h-screen flex items-center justify-center bg-[#0B1120] text-blue-500 font-black animate-pulse">COMPILANDO DADOS...</div>;

  return (
    <div className="p-6 space-y-6 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER INTEGRADO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Sala de Comando (BI)</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
            <ShieldCheck size={12} className="text-blue-500"/> Análise Estratégica de Performance e Curva ABC
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={fetchReportData} className="bg-white/5 border border-white/10 text-slate-400 p-3 rounded-xl hover:text-white transition-all shadow-lg flex-shrink-0">
            <Zap size={18}/>
          </button>
          <button className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all whitespace-nowrap">
            <Download size={16}/> Exportar PDF
          </button>
        </div>
      </div>

      {/* --- BARRA DE FILTROS TRIPLOS (BI) --- */}
      <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl overflow-hidden w-full md:w-max shadow-lg mb-4">
          <Filter size={14} className="text-slate-400 ml-4 mr-2" />
          
          <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)} className="bg-transparent text-white text-xs font-bold uppercase tracking-wider outline-none cursor-pointer py-3 px-3 border-r border-white/10 hover:bg-white/5 transition-colors">
              <option value="Mês Atual" className="bg-[#0B1120]">Mês Atual</option>
              <option value="Mês Passado" className="bg-[#0B1120]">Mês Passado</option>
              <option value="Ano Atual" className="bg-[#0B1120]">Ano Atual</option>
              <option value="Todo o Período" className="bg-[#0B1120]">Todo o Período</option>
          </select>

          <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="bg-transparent text-white text-xs font-bold uppercase tracking-wider outline-none cursor-pointer py-3 px-3 border-r border-white/10 hover:bg-white/5 transition-colors">
              <option value="Todas" className="bg-[#0B1120]">Todas Unidades</option>
              {unidadesDisponiveis.map(u => <option key={u} value={u} className="bg-[#0B1120]">{u}</option>)}
          </select>

          {isDirector && (
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="bg-transparent text-blue-400 text-xs font-black uppercase tracking-wider outline-none cursor-pointer py-3 px-3 hover:bg-white/5 transition-colors">
                  <option value="Todos" className="bg-[#0B1120]">Equipe Inteira</option>
                  {vendedoresDisponiveis.map(v => <option key={v} value={v} className="bg-[#0B1120]">{v}</option>)}
              </select>
          )}
      </div>

      {/* COMPARATIVOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: `Faturamento (${filtroPeriodo})`, current: currentMonth.faturamento, last: lastMonth.faturamento, prefix: 'R$ ', icon: TrendingUp, color: 'text-[#22C55E]' },
          { label: `Oportunidades (${filtroPeriodo})`, current: currentMonth.leads, last: lastMonth.leads, prefix: '', icon: Target, color: 'text-blue-500' },
          { label: `Ticket Médio (${filtroPeriodo})`, current: currentMonth.ticket, last: lastMonth.ticket, prefix: 'R$ ', icon: Zap, color: 'text-purple-500' },
          { label: `Taxa de Conversão`, current: currentMonth.conversao, last: lastMonth.conversao, prefix: '', suffix: '%', icon: Clock, color: 'text-orange-500' },
        ].map((item, i) => {
          // Se o filtro for Ano Atual ou Todo o Período, escondemos o comparativo do last (que estaria zerado)
          const isComparing = filtroPeriodo === 'Mês Atual' || filtroPeriodo === 'Mês Passado';
          const growth = isComparing && item.last !== undefined ? getGrowth(item.current, item.last) : null;
          
          return (
            <div key={i} className="bg-[#0B1120] border border-white/5 p-6 rounded-[32px] shadow-2xl relative overflow-hidden group hover:border-white/10 transition-all">
              <item.icon className={`absolute -right-4 -top-4 w-20 h-20 opacity-5 ${item.color}`} />
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{item.label}</p>
              <div className="flex items-end gap-2">
                <h3 className={`text-2xl font-black italic tracking-tighter ${item.color}`}>
                  {item.prefix}{item.current.toLocaleString('pt-BR', {maximumFractionDigits: 0})}{item.suffix}
                </h3>
                {growth !== null && (
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
          
          <div className="space-y-6 relative z-10 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
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
            )) : <p className="text-slate-600 text-xs italic font-bold uppercase flex items-center gap-2"><AlertCircle size={14}/> Sem vendas cadastradas com itens detalhados neste filtro.</p>}
          </div>
        </div>

        {/* RANKING PERMANENTE */}
        <div className="bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl flex flex-col">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-8">
            <Users size={20} className="text-purple-500" /> Elite de Vendas
          </h3>
          <div className="space-y-6 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar pr-2">
            {rankingVendedores.length > 0 ? rankingVendedores.map((vend, idx) => (
              <div key={vend.nome} className="flex items-center gap-4 group">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black italic shadow-lg ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-slate-500 border border-white/10'}`}>
                  {idx + 1}º
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-white font-black text-xs uppercase group-hover:text-purple-400 transition-colors">{vend.nome}</span>
                    <span className="text-[#22C55E] font-black text-[10px]">R$ {vend.total.toLocaleString('pt-BR')}</span>
                  </div>
                  <ProgressBar value={vend.total} max={rankingVendedores[0]?.total || 1} color="bg-purple-600" />
                  <p className="text-[9px] text-slate-600 font-bold mt-1 uppercase">Taxa de Conversão: {Math.round(vend.conversao)}%</p>
                </div>
              </div>
            )) : <p className="text-slate-600 text-xs italic font-bold uppercase">Sem vendas registradas.</p>}
          </div>
        </div>
      </div>

      {/* TABELA DE ESTRATÉGIAS */}
      <div className="bg-[#0B1120] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2">
            <BarChart3 size={20} className="text-[#22C55E]" /> ROI de Estratégias (Premissas)
          </h3>
          <span className="text-[10px] text-blue-500 font-black uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full">Filtro: {filtroPeriodo}</span>
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
                    <td colSpan={5} className="px-8 py-10 text-center text-slate-600 text-xs font-black uppercase flex flex-col items-center justify-center">
                        <Target size={24} className="mb-2 opacity-20"/>
                        Nenhuma estratégia gerou resultado neste período/unidade.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}