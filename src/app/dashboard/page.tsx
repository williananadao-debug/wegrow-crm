"use client";
import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Users, Radio, DollarSign, 
  BarChart3, Calendar, Loader2, 
  CheckCircle2, MapPin, FileText, Target, Filter, X, AlertCircle, Building2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type RankingItem = { id: string; nome: string; total: number; count: number; };

export default function DashboardPage() {
  const { user, perfil } = useAuth();
  const [loading, setLoading] = useState(true);
  const [visao, setVisao] = useState<'comercial' | 'diretoria'>('comercial'); 
  
  // --- ESTADOS DOS FILTROS ---
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('Ano Atual');
  const [filtroUnidade, setFiltroUnidade] = useState<string>('Todas');
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string | null>(null);

  // Mês padrão só para não quebrar lógicas antigas, mas o filtro principal é o filtroPeriodo
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // ESTADOS DE DADOS BRUTOS
  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [rawPerfis, setRawPerfis] = useState<any[]>([]);
  const [rawJobs, setRawJobs] = useState<any[]>([]);
  const [rawLancamentos, setRawLancamentos] = useState<any[]>([]);

  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    if (user) carregarDadosOtimizado();
  }, [user, perfil]);

  const carregarDadosOtimizado = async () => {
    setLoading(true);
    try {
        let leadsQuery = supabase.from('leads').select('*');

        if (!isDirector) {
            // Se não for diretor, traz os cards importados com o nome dele OU criados pelo ID dele
            leadsQuery = leadsQuery.or(`user_id.eq.${user?.id},vendedor_nome.ilike.%${perfil?.nome}%`);
        }

        const [leadsRes, perfisRes, jobsRes, finRes] = await Promise.all([
            leadsQuery, 
            supabase.from('profiles').select('id, nome'), 
            supabase.from('jobs').select('stage, deadline'),
            supabase.from('lancamentos').select('valor, tipo').eq('status', 'pago')
        ]);

        if (leadsRes.error) console.error("Erro Leads:", leadsRes.error);

        setRawLeads(leadsRes.data || []);
        setRawPerfis(perfisRes.data || []);
        setRawJobs(jobsRes.data || []);
        setRawLancamentos(finRes.data || []);

    } catch (error) {
        console.error("Erro crítico no dashboard:", error);
    } finally {
        setLoading(false);
    }
  };

  // --- FILTROS DISPONÍVEIS ---
  const unidadesDisponiveis = Array.from(new Set(rawLeads.map(l => l.unidade).filter(Boolean))) as string[];
  const vendedoresDisponiveis = Array.from(new Set(rawLeads.map(l => l.vendedor_nome).filter(Boolean))) as string[];

  // CÁLCULOS MEMOIZADOS (Recalcula sempre que um filtro muda)
  const { ranking, statsComercial, statsProducao, statsFinanceiro } = useMemo(() => {
      
      const nomesMap = rawPerfis.reduce((acc: any, p) => ({ ...acc, [p.id]: p.nome }), {});

      // --- APLICAÇÃO DOS FILTROS NO DASHBOARD ---
      const leadsFiltrados = rawLeads.filter(lead => {
          // 1. Filtro de Unidade
          if (filtroUnidade !== 'Todas' && lead.unidade !== filtroUnidade) return false;
          
          // 2. Filtro de Vendedor
          if (vendedorSelecionado && vendedorSelecionado !== 'Todos') {
              // Verifica pelo ID ou pelo Nome importado
              if (lead.user_id !== vendedorSelecionado && lead.vendedor_nome !== vendedorSelecionado) return false;
          }
          
          // 3. Filtro de Período Dinâmico
          if (filtroPeriodo !== 'Todo o Período') {
              const dataLead = new Date(lead.created_at);
              const hoje = new Date();
              
              if (filtroPeriodo === 'Mês Atual') {
                  if (dataLead.getMonth() !== hoje.getMonth() || dataLead.getFullYear() !== hoje.getFullYear()) return false;
              } else if (filtroPeriodo === 'Mês Passado') {
                  const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
                  if (dataLead.getMonth() !== mesPassado.getMonth() || dataLead.getFullYear() !== mesPassado.getFullYear()) return false;
              } else if (filtroPeriodo === 'Ano Atual') {
                  if (dataLead.getFullYear() !== hoje.getFullYear()) return false;
              }
          }
          return true;
      });

      // --- RANKING (Baseado nos dados FILTRADOS) ---
      const rankObj = leadsFiltrados.reduce((acc: any, lead) => {
         // Prioriza o nome importado do CSV, se não tiver, busca o ID
         const nomeVendedor = lead.vendedor_nome || nomesMap[lead.user_id] || 'Desconhecido';
         // Usa o nome como chave para não duplicar se o ID for nulo
         const chave = lead.vendedor_nome ? lead.vendedor_nome : (lead.user_id || 'sem_dono');

         if (!acc[chave]) acc[chave] = { id: chave, nome: nomeVendedor, total: 0, count: 0 };
         if (lead.status === 'ganho') acc[chave].total += (Number(lead.valor_total) || 0);
         acc[chave].count += 1;
         return acc;
      }, {});
      
      const rankingFinal = Object.values(rankObj).sort((a: any, b: any) => b.total - a.total) as RankingItem[];

      // --- CÁLCULOS KPI COMERCIAL ---
      const fat = leadsFiltrados
        .filter(l => l.status === 'ganho')
        .reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0);

      const visitas = leadsFiltrados.filter(l => l.checkin).length;
      const ganhos = leadsFiltrados.filter(l => l.status === 'ganho').length;
      const totalFinal = leadsFiltrados.filter(l => l.status === 'ganho' || l.status === 'perdido').length;
      const conversao = totalFinal > 0 ? (ganhos / totalFinal) * 100 : 0;
      
      const comVisita = leadsFiltrados.filter(l => l.checkin && l.checkin.length > 5).length; 
      const semVisita = leadsFiltrados.length - comVisita;

      // --- FUNIL ---
      const funil = { novos: 0, contato: 0, proposta: 0, negociacao: 0, ganho: 0, perdido: 0 };
      leadsFiltrados.forEach(l => {
          const st = l.status;
          const et = Number(l.etapa);
          if (st === 'ganho') funil.ganho++;
          else if (st === 'perdido') funil.perdido++;
          else {
              if (et === 0) funil.novos++;
              if (et === 1) funil.contato++;
              if (et === 2) funil.proposta++;
              if (et >= 3) funil.negociacao++;
          }
      });

      // --- VENDAS POR DIA (Baseado no Mês Atual) ---
      const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      const vendasPorDiaArray = Array.from({ length: diasNoMes }, (_, i) => ({
          dia: (i + 1).toString(),
          valor: 0
      }));

      // Só alimenta o gráfico de dias se o filtro for Mês Atual (se for ano, não faz sentido dia a dia)
      if (filtroPeriodo === 'Mês Atual' || filtroPeriodo === 'Mês Passado') {
          leadsFiltrados.filter(l => l.status === 'ganho').forEach(l => {
              const dataCriacao = new Date(l.created_at);
              const diaIndex = dataCriacao.getDate() - 1; 
              if (vendasPorDiaArray[diaIndex]) {
                  vendasPorDiaArray[diaIndex].valor += (Number(l.valor_total) || 0);
              }
          });
      }

      // --- DADOS DIRETORIA ---
      const prod = { roteiro: 0, gravacao: 0, edicao: 0, opec: 0 };
      rawJobs.forEach((j: any) => {
        if (j.stage === 'roteiro') prod.roteiro++;
        if (j.stage === 'gravacao') prod.gravacao++;
        if (j.stage === 'edicao') prod.edicao++;
        if (j.stage === 'opec') prod.opec++;
      });

      const ent = rawLancamentos.filter(l => l.tipo === 'entrada').reduce((acc, l) => acc + l.valor, 0);
      const sai = rawLancamentos.filter(l => l.tipo === 'saida').reduce((acc, l) => acc + l.valor, 0);

      return {
          ranking: rankingFinal,
          statsComercial: {
            faturamentoMês: fat,
            metaMes: 100000,
            leadsAbertos: leadsFiltrados.filter(l => l.status === 'aberto').length,
            totalVisitas: visitas,
            taxaConversao: Math.round(conversao),
            propostasEnviadas: leadsFiltrados.length,
            leadsSemVisita: semVisita,
            leadsComVisita: comVisita,
            funil,
            vendasPorDia: vendasPorDiaArray
          },
          statsProducao: prod,
          statsFinanceiro: { saldo: ent - sai, entradas: ent, saidas: sai }
      };

  }, [rawLeads, rawPerfis, rawJobs, rawLancamentos, vendedorSelecionado, filtroPeriodo, filtroUnidade]);

  const handleSellerClick = (id: string) => setVendedorSelecionado(prev => prev === id ? null : id);

  const getDonutGradient = (visitados: number, pendentes: number) => {
     const total = visitados + pendentes;
     if (total === 0) return `conic-gradient(#334155 100%, #334155 100%)`;
     const pct = (visitados / total) * 100;
     return `conic-gradient(#22C55E ${pct}%, #EF4444 0)`;
  };

  const formatCompact = (num: number) => {
      if(num >= 1000) return (num / 1000).toFixed(1) + 'k';
      return num.toString();
  };

  if (loading && !rawLeads.length) return <div className="h-screen flex items-center justify-center bg-[#0B1120] text-white"><Loader2 className="animate-spin mr-2"/> Otimizando Dashboard...</div>;

  return (
    <main className="space-y-4 pb-4 animate-in fade-in duration-500">
      
      {/* HEADER COMPACTO E FILTROS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2 px-2">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">
            Dashboard
          </h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
            Visão Geral • {perfil?.nome || 'Equipe'}
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
            {/* ABAS COMERCIAL / GESTÃO */}
            <div className="bg-[#0B1120] border border-white/10 p-1 rounded-2xl flex gap-1 self-end">
                <button onClick={() => setVisao('comercial')} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${visao === 'comercial' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500 hover:text-white'}`}>
                    <TrendingUp size={12}/> Comercial
                </button>
                {isDirector && (
                  <button onClick={() => setVisao('diretoria')} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${visao === 'diretoria' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                      <Radio size={12}/> Gestão
                  </button>
                )}
            </div>
            
            {/* NOVO: BARRA DE FILTROS DO DASHBOARD */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl overflow-hidden w-full md:w-auto">
                <Filter size={14} className="text-slate-400 ml-3 mr-1" />
                
                <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)} className="bg-transparent text-white text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer py-2 px-2 border-r border-white/10">
                    <option value="Todo o Período" className="bg-[#0B1120]">Todo o Período</option>
                    <option value="Ano Atual" className="bg-[#0B1120]">Ano Atual</option>
                    <option value="Mês Atual" className="bg-[#0B1120]">Mês Atual</option>
                    <option value="Mês Passado" className="bg-[#0B1120]">Mês Passado</option>
                </select>

                <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="bg-transparent text-white text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer py-2 px-2 border-r border-white/10">
                    <option value="Todas" className="bg-[#0B1120]">Todas Unidades</option>
                    {unidadesDisponiveis.map(u => <option key={u} value={u} className="bg-[#0B1120]">{u}</option>)}
                </select>

                {isDirector && (
                    <select value={vendedorSelecionado || 'Todos'} onChange={e => setVendedorSelecionado(e.target.value === 'Todos' ? null : e.target.value)} className="bg-transparent text-orange-500 text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer py-2 px-2">
                        <option value="Todos" className="bg-[#0B1120]">Toda Equipe</option>
                        {vendedoresDisponiveis.map(v => <option key={v} value={v} className="bg-[#0B1120]">{v}</option>)}
                    </select>
                )}
            </div>
        </div>
      </div>

      {visao === 'comercial' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* KPIS COMPACTOS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg">
                    <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-0.5 flex justify-between">Faturamento {filtroUnidade !== 'Todas' && <Building2 size={10} className="text-white/20"/>}</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">R$ {statsComercial.faturamentoMês.toLocaleString('pt-BR', { notation: "compact" })}</h3>
                    <TrendingUp className="absolute top-4 right-4 text-orange-500 opacity-20" size={24} />
                </div>
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg">
                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5">Conversão</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">{statsComercial.taxaConversao}%</h3>
                    <CheckCircle2 className="absolute top-4 right-4 text-blue-400 opacity-20" size={24} />
                </div>
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg">
                    <p className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-0.5">Visitas</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">{statsComercial.totalVisitas}</h3>
                    <MapPin className="absolute top-4 right-4 text-yellow-400 opacity-20" size={24} />
                </div>
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg">
                    <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-0.5">Leads Totais</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">{statsComercial.propostasEnviadas}</h3>
                    <FileText className="absolute top-4 right-4 text-purple-400 opacity-20" size={24} />
                </div>
            </div>

            {/* AVISO SE NÃO TIVER DADOS */}
            {statsComercial.propostasEnviadas === 0 && (
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-center gap-3 text-slate-400">
                    <AlertCircle size={16} />
                    <span className="text-xs font-bold uppercase">Sem dados comerciais para este filtro.</span>
                </div>
            )}

            {/* GRÁFICO DIÁRIO SÓ APARECE SE O FILTRO FOR MENSAL */}
            {(filtroPeriodo === 'Mês Atual' || filtroPeriodo === 'Mês Passado') && (
                <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4">
                        <BarChart3 size={14} className="text-orange-500"/> Vendas por Dia ({filtroPeriodo})
                    </h3>
                    <div className="flex items-end h-40 gap-1 overflow-x-auto pb-1 custom-scrollbar w-full pt-4">
                        {statsComercial.vendasPorDia.map((d, i) => {
                            const maxVal = Math.max(...statsComercial.vendasPorDia.map(v => v.valor), 1);
                            const height = (d.valor / maxVal) * 100;
                            
                            return (
                                <div key={i} className="flex-1 min-w-[24px] group flex flex-col justify-end h-full relative hover:bg-white/5 rounded-lg transition-colors p-0.5">
                                    {d.valor > 0 && (
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-orange-500 text-[9px] font-black tracking-tighter whitespace-nowrap z-10">
                                            {formatCompact(d.valor)}
                                        </div>
                                    )}
                                    
                                    <div 
                                        className={`w-full rounded-t-sm transition-all duration-700 relative ${d.valor > 0 ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'bg-white/5'}`} 
                                        style={{ height: d.valor > 0 ? `${Math.max(height, 5)}%` : '4px' }}
                                    >
                                        {d.valor > 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50"></div>}
                                    </div>
                                    <span className={`text-[9px] text-center font-bold mt-1 ${d.valor > 0 ? 'text-white' : 'text-slate-600'}`}>{d.dia}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* RANKING - DINÂMICO */}
                <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-white mb-3">
                        <Users size={14} className="text-orange-500" /> Ranking ({filtroUnidade})
                        <span className="text-[8px] bg-white/10 px-1.5 py-0.5 rounded text-slate-400 not-italic font-normal">Clique para isolar</span>
                    </h3>
                    <div className="space-y-2 overflow-y-auto max-h-[200px] pr-1 custom-scrollbar">
                        {ranking.map((r, index) => (
                            <div key={r.id} onClick={() => handleSellerClick(r.id)} className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all group ${vendedorSelecionado === r.id ? 'bg-orange-500/10 border-orange-500' : 'bg-white/5 border-white/5 hover:border-orange-500/50'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${index === 0 ? 'bg-orange-500 text-[#0B1120]' : 'bg-blue-600 text-white'}`}>{index + 1}º</div>
                                    <div><p className="font-black uppercase text-xs text-white">{r.nome}</p><p className="text-[9px] text-slate-500 font-bold">{r.count} Vendas</p></div>
                                </div>
                                <p className={`text-sm font-black ${vendedorSelecionado === r.id ? 'text-orange-500' : 'text-slate-300'}`}>R$ {r.total.toLocaleString()}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* FUNIL RESUMO */}
                <div className="lg:col-span-1 bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black text-white uppercase italic mb-3 flex items-center gap-2"><Target size={14} className="text-blue-500"/> Funil</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-[10px] text-slate-400 font-bold uppercase">Abertos</span><span className="text-xs font-black text-white">{statsComercial.leadsAbertos}</span></div>
                        <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-[10px] text-orange-500 font-bold uppercase">Ganhos</span><span className="text-xs font-black text-orange-500">{statsComercial.funil.ganho}</span></div>
                        <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-[10px] text-red-500 font-bold uppercase">Perdidos</span><span className="text-xs font-black text-red-500">{statsComercial.funil.perdido}</span></div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* DONUT VISITAS */}
                <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl flex flex-col items-center justify-center">
                    <h3 className="text-sm font-black text-white uppercase italic mb-2 flex items-center gap-2 self-start"><MapPin size={14} className="text-yellow-500"/> Visitas</h3>
                    <div className="w-32 h-32 rounded-full flex items-center justify-center relative" style={{ background: getDonutGradient(statsComercial.leadsComVisita, statsComercial.leadsSemVisita) }}>
                        <div className="w-24 h-24 bg-[#0B1120] rounded-full flex flex-col items-center justify-center z-10">
                            <span className="text-xl font-black text-white">{statsComercial.propostasEnviadas}</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase">Total</span>
                        </div>
                    </div>
                    <div className="flex gap-4 mt-3">
                        <div className="text-center"><p className="text-sm font-black text-[#22C55E]">{statsComercial.leadsComVisita}</p><span className="text-[8px] font-bold text-slate-500 uppercase">Feitas</span></div>
                        <div className="text-center"><p className="text-sm font-black text-red-500">{statsComercial.leadsSemVisita}</p><span className="text-[8px] font-bold text-slate-500 uppercase">Pendentes</span></div>
                    </div>
                </div>

                {/* VOLUME POR ETAPA */}
                <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-3"><BarChart3 size={14} className="text-blue-500"/> Volume por Etapa</h3>
                    <div className="flex items-end h-40 gap-3 px-2 w-full pt-4">
                        {[
                            { label: 'Novos', val: statsComercial.funil.novos, color: 'bg-blue-600' },
                            { label: 'Contato', val: statsComercial.funil.contato, color: 'bg-blue-500' },
                            { label: 'Proposta', val: statsComercial.funil.proposta, color: 'bg-purple-500' },
                            { label: 'Negoc.', val: statsComercial.funil.negociacao, color: 'bg-yellow-500' },
                            { label: 'Ganhos', val: statsComercial.funil.ganho, color: 'bg-orange-500' },
                        ].map((etapa, i, arr) => {
                            const maxEtapa = Math.max(...arr.map(e => e.val), 1);
                            const h = (etapa.val / maxEtapa) * 100;
                            
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center justify-end group h-full relative">
                                    <div className="mb-1 text-[10px] font-black text-white">{etapa.val}</div>
                                    <div 
                                        className={`w-full rounded-t-lg transition-all duration-1000 ${etapa.color} opacity-90 hover:opacity-100 relative`} 
                                        style={{ height: `${Math.max(h, 2)}%` }}
                                    >
                                        {etapa.val > 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50"></div>}
                                    </div>
                                    <div className="mt-2 text-[8px] font-black uppercase text-slate-500 tracking-wider text-center">{etapa.label}</div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* VISÃO DIRETORIA COMPACTA */}
      {visao === 'diretoria' && isDirector && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl"><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Saldo</p><h3 className={`text-2xl font-black tracking-tight ${statsFinanceiro.saldo >= 0 ? 'text-[#22C55E]' : 'text-red-500'}`}>R$ {statsFinanceiro.saldo.toLocaleString()}</h3></div>
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl"><p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5">Entradas</p><h3 className="text-xl font-black text-white">R$ {statsFinanceiro.entradas.toLocaleString()}</h3></div>
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl"><p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-0.5">Saídas</p><h3 className="text-xl font-black text-white">R$ {statsFinanceiro.saidas.toLocaleString()}</h3></div>
            </div>
            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4"><Radio className="text-[#22C55E]" size={16} /> Gargalos de Produção</h3>
                <div className="space-y-4">
                    {[{ label: '📝 Pauta / Roteiro', val: statsProducao.roteiro, color: 'bg-slate-500' }, { label: '🎙️ Cabine / Gravação', val: statsProducao.gravacao, color: 'bg-red-500' }, { label: '🎚️ Edição / Plástica', val: statsProducao.edicao, color: 'bg-blue-500' }, { label: '📡 OPEC / No Ar', val: statsProducao.opec, color: 'bg-[#22C55E]' }].map((step, i) => { const total = statsProducao.roteiro + statsProducao.gravacao + statsProducao.edicao + 1; const pct = (step.val / total) * 100; return (<div key={i} className="group"><div className="flex justify-between text-[9px] font-black uppercase mb-1 text-slate-400 group-hover:text-white"><span>{step.label}</span><span className="text-sm">{step.val}</span></div><div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5"><div className={`h-full ${step.color} rounded-full transition-all duration-1000 relative`} style={{width: `${step.label.includes('OPEC') ? 100 : Math.max(pct, 2)}%`}}></div></div></div>)})}
                </div>
            </div>
        </div>
      )}
    </main>
  );
}