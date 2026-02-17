"use client";
import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Users, Radio, DollarSign, 
  BarChart3, Calendar, Loader2, 
  CheckCircle2, MapPin, FileText, Target, Filter, X, AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type RankingItem = { id: string; nome: string; total: number; count: number; };

export default function DashboardPage() {
  const { user, perfil } = useAuth();
  const [loading, setLoading] = useState(true);
  const [visao, setVisao] = useState<'comercial' | 'diretoria'>('comercial'); 
  
  // Mês padrão: YYYY-MM
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string | null>(null);

  // ESTADOS DE DADOS BRUTOS (Raw Data)
  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [rawPerfis, setRawPerfis] = useState<any[]>([]);
  const [rawJobs, setRawJobs] = useState<any[]>([]);
  const [rawLancamentos, setRawLancamentos] = useState<any[]>([]);

  // Verifica se é chefe (Diretor ou o Admin Supremo)
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    if (user) carregarDadosOtimizado();
  }, [user, mesSelecionado]);

  const carregarDadosOtimizado = async () => {
    setLoading(true);
    try {
        // 1. Define intervalo de datas para o Banco (Otimização Server-Side)
        const [ano, mes] = mesSelecionado.split('-').map(Number);
        const dataInicio = new Date(ano, mes - 1, 1).toISOString();
        const dataFim = new Date(ano, mes, 0, 23, 59, 59).toISOString();

        // --- ALTERAÇÃO DE SEGURANÇA AQUI ---
        // Construção da Query de Leads com Filtro Condicional
        let leadsQuery = supabase.from('leads')
            .select('*')
            .gte('created_at', dataInicio)
            .lte('created_at', dataFim);

        // Se NÃO for diretor, força o filtro apenas para os dados DELE
        if (!isDirector) {
            leadsQuery = leadsQuery.eq('user_id', user?.id);
        }
        // -----------------------------------

        // 2. PARALELISMO: Busca tudo de uma vez
        const [leadsRes, perfisRes, jobsRes, finRes] = await Promise.all([
            leadsQuery, // Usa a query protegida
            supabase.from('profiles').select('id, nome'), // Corrigido para tabela 'profiles'
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

  // CÁLCULOS MEMOIZADOS (Só roda se os dados mudarem)
  const { ranking, statsComercial, statsProducao, statsFinanceiro } = useMemo(() => {
      
      // --- 1. PREPARAÇÃO (Mapeamento de Nomes) ---
      const nomesMap = rawPerfis.reduce((acc: any, p) => ({ ...acc, [p.id]: p.nome }), {});

      // --- 2. GERA RANKING (Baseado nos dados brutos do mês) ---
      // Como rawLeads já vem filtrado do banco se for vendedor, o ranking só vai mostrar ele mesmo
      const rankObj = rawLeads.reduce((acc: any, lead) => {
         const id = lead.user_id || 'sem_dono';
         const nome = nomesMap[id] || 'Desconhecido';
         if (!acc[id]) acc[id] = { id, nome, total: 0, count: 0 };
         if (lead.status === 'ganho') acc[id].total += (Number(lead.valor_total) || 0);
         acc[id].count += 1;
         return acc;
      }, {});
      
      const rankingFinal = Object.values(rankObj).sort((a: any, b: any) => b.total - a.total) as RankingItem[];

      // --- 3. FILTRAGEM DINÂMICA (Vendedor Selecionado) ---
      let leadsFiltrados = rawLeads;
      if (vendedorSelecionado) {
        if (vendedorSelecionado === 'sem_dono') {
            leadsFiltrados = rawLeads.filter(l => !l.user_id);
        } else {
            leadsFiltrados = rawLeads.filter(l => l.user_id === vendedorSelecionado);
        }
      }

      // --- 4. CÁLCULOS KPI COMERCIAL ---
      const fat = leadsFiltrados
        .filter(l => l.status === 'ganho')
        .reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0);

      const visitas = leadsFiltrados.filter(l => l.checkin).length;
      const ganhos = leadsFiltrados.filter(l => l.status === 'ganho').length;
      const totalFinal = leadsFiltrados.filter(l => l.status === 'ganho' || l.status === 'perdido').length;
      const conversao = totalFinal > 0 ? (ganhos / totalFinal) * 100 : 0;
      
      const comVisita = leadsFiltrados.filter(l => l.checkin && l.checkin.length > 5).length; // Validação simples
      const semVisita = leadsFiltrados.length - comVisita;

      // --- 5. FUNIL ---
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

      // --- 6. VENDAS POR DIA ---
      const [anoStr, mesStr] = mesSelecionado.split('-');
      const diasNoMes = new Date(Number(anoStr), Number(mesStr), 0).getDate();
      
      const vendasPorDiaArray = Array.from({ length: diasNoMes }, (_, i) => ({
          dia: (i + 1).toString(),
          valor: 0
      }));

      leadsFiltrados.filter(l => l.status === 'ganho').forEach(l => {
          const dataCriacao = new Date(l.created_at);
          const diaIndex = dataCriacao.getDate() - 1; 
          
          if (vendasPorDiaArray[diaIndex]) {
              vendasPorDiaArray[diaIndex].valor += (Number(l.valor_total) || 0);
          }
      });

      // --- 7. DADOS DIRETORIA (JOBS & FINANCEIRO) ---
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

  }, [rawLeads, rawPerfis, rawJobs, rawLancamentos, vendedorSelecionado, mesSelecionado]);

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
      
      {/* HEADER COMPACTO */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">
            Dashboard
          </h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">
            Visão Geral • {perfil?.nome || 'Equipe'}
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
            <div className="bg-[#0B1120] border border-white/10 p-1 rounded-2xl flex gap-1">
                <button onClick={() => setVisao('comercial')} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${visao === 'comercial' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500 hover:text-white'}`}>
                    <TrendingUp size={12}/> Comercial
                </button>
                {/* Botão de Diretoria só aparece para o Diretor */}
                {isDirector && (
                  <button onClick={() => setVisao('diretoria')} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${visao === 'diretoria' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                      <Radio size={12}/> Gestão
                  </button>
                )}
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-2xl">
                <Calendar size={12} className="text-blue-500" />
                <input type="month" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="bg-transparent border-none outline-none text-[9px] font-black uppercase tracking-widest text-white cursor-pointer"/>
            </div>
        </div>
      </div>

      {visao === 'comercial' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* FILTRO ATIVO (COMPACTO) */}
            {vendedorSelecionado && (
                <div className="bg-orange-500/10 border border-orange-500/20 p-2 px-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-orange-500" />
                        <span className="text-xs font-bold text-white uppercase">
                            Filtrando: <span className="text-orange-500 italic">{ranking.find(r => r.id === vendedorSelecionado)?.nome || 'Sem Dono'}</span>
                        </span>
                    </div>
                    <button onClick={() => setVendedorSelecionado(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-white flex items-center gap-1">
                        <X size={12}/> Limpar
                    </button>
                </div>
            )}

            {/* KPIS COMPACTOS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg">
                    <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-0.5">Faturamento</p>
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
                    <span className="text-xs font-bold uppercase">Sem dados comerciais neste mês.</span>
                </div>
            )}

            {/* GRÁFICO DIÁRIO CORRIGIDO */}
            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4">
                    <BarChart3 size={14} className="text-orange-500"/> Vendas por Dia
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* RANKING - LARANJA */}
                <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-white mb-3">
                        <Users size={14} className="text-orange-500" /> Ranking
                        <span className="text-[8px] bg-white/10 px-1.5 py-0.5 rounded text-slate-400 not-italic font-normal">Clique para filtrar</span>
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