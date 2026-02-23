"use client";
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  TrendingUp, BarChart3, PieChart, Users, 
  ArrowUpRight, ArrowDownRight, Target, Calendar,
  Download, Zap, Clock, ChevronRight, Filter, 
  ShieldCheck, Crosshair, Sparkles, Building2, AlertCircle, MapPin, Globe2
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

const ProgressBar = ({ value, max, color }: { value: number, max: number, color: string }) => (
  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
    <div 
      className={`h-full ${color} transition-all duration-1000`} 
      style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%` }}
    />
  </div>
);

const getCityCoordinates = (cityName: string) => {
    if (!cityName) return null;
    const name = cityName.toUpperCase();
    if (name.includes('ITAJAÍ') || name.includes('ITAJAI')) return { top: '45%', left: '85%' };
    if (name.includes('CAMBORIÚ') || name.includes('CAMBORIU')) return { top: '48%', left: '86%' };
    if (name.includes('JOINVILLE')) return { top: '20%', left: '80%' };
    if (name.includes('FLORIPA') || name.includes('FLORIAN')) return { top: '65%', left: '85%' };
    if (name.includes('BLUMENAU')) return { top: '40%', left: '75%' };
    if (name.includes('CHAPECÓ') || name.includes('CHAPECO')) return { top: '45%', left: '15%' };
    if (name.includes('LAGES')) return { top: '60%', left: '50%' };
    if (name.includes('CRICIÚMA') || name.includes('CRICIUMA')) return { top: '85%', left: '75%' };
    if (name.includes('TUBARÃO') || name.includes('TUBARAO')) return { top: '80%', left: '80%' };
    if (name.includes('JARAGUÁ') || name.includes('JARAGUA')) return { top: '25%', left: '75%' };
    if (name.includes('BRUSQUE')) return { top: '45%', left: '80%' };
    if (name.includes('JOSÉ') || name.includes('JOSE')) return { top: '63%', left: '83%' };
    if (name.includes('PALHOÇA') || name.includes('PALHOCA')) return { top: '66%', left: '83%' };
    if (name.includes('NAVEGANTES')) return { top: '43%', left: '86%' };
    return null; 
};

export default function ReportsPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  const [loading, setLoading] = useState(true);
  
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('Mês Atual'); 
  const [filtroUnidade, setFiltroUnidade] = useState<string>('Todas');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('Todos');

  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [rawPremissas, setRawPremissas] = useState<any[]>([]);
  const [rawProfiles, setRawProfiles] = useState<any[]>([]);
  const [rawClientes, setRawClientes] = useState<any[]>([]); 

  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => { 
      if (user) fetchReportData(); 
  }, [user, perfil]);

  async function fetchReportData() {
    setLoading(true);
    try {
      let leadsQuery = supabase.from('leads').select('*');
      
      if (!isDirector) {
          leadsQuery = leadsQuery.or(`user_id.eq.${user?.id},vendedor_nome.ilike.%${perfil?.nome}%`);
      }

      // Puxando 'cidade' (que é a coluna que está funcionando na sua tela de Clientes)
      const [leadsRes, premissasRes, profilesRes, clientesRes] = await Promise.all([
        leadsQuery,
        supabase.from('premissas').select('*'),
        supabase.from('profiles').select('id, nome'),
        supabase.from('clientes').select('id, nome_empresa, cidade, bairro') 
      ]);

      setRawLeads(leadsRes.data || []);
      setRawPremissas(premissasRes.data || []);
      setRawProfiles(profilesRes.data || []);
      setRawClientes(clientesRes.data || []);
      
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally { 
      setLoading(false); 
    }
  }

  const unidadesDisponiveis = Array.from(new Set(rawLeads.map(l => l.unidade).filter(Boolean))) as string[];
  const vendedoresDisponiveis = Array.from(new Set(rawLeads.map(l => l.vendedor_nome).filter(Boolean))) as string[];

  const { 
      currentMonth, 
      lastMonth, 
      rankingVendedores, 
      servicosCurva, 
      estrategiasImpacto,
      performanceUnidades,
      mapaCidades 
  } = useMemo(() => {
      
      const now = new Date();
      const firstDayAnoAtual = new Date(now.getFullYear(), 0, 1).toISOString();
      const firstDayCurrent = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const firstDayLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastDayLast = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

      const nomesMap = rawProfiles.reduce((acc: any, p) => ({ ...acc, [p.id]: p.nome }), {});
      
      const cidadesById = rawClientes.reduce((acc: any, c) => ({ ...acc, [c.id]: c.cidade }), {});

      const baseFiltrada = rawLeads.filter(lead => {
          if (filtroUnidade !== 'Todas' && lead.unidade !== filtroUnidade) return false;
          if (filtroVendedor !== 'Todos' && lead.user_id !== filtroVendedor && lead.vendedor_nome !== filtroVendedor) return false;
          return true;
      });

      let currentLeads = [];
      let pastLeads = []; 

      if (filtroPeriodo === 'Ano Atual') {
          currentLeads = baseFiltrada.filter(l => l.created_at && l.created_at >= firstDayAnoAtual);
      } else if (filtroPeriodo === 'Mês Atual') {
          currentLeads = baseFiltrada.filter(l => l.created_at && l.created_at >= firstDayCurrent);
          pastLeads = baseFiltrada.filter(l => l.created_at && l.created_at >= firstDayLast && l.created_at <= lastDayLast);
      } else if (filtroPeriodo === 'Mês Passado') {
          currentLeads = baseFiltrada.filter(l => l.created_at && l.created_at >= firstDayLast && l.created_at <= lastDayLast);
          const firstDayRetrasado = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
          const lastDayRetrasado = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59).toISOString();
          pastLeads = baseFiltrada.filter(l => l.created_at && l.created_at >= firstDayRetrasado && l.created_at <= lastDayRetrasado);
      } else {
          currentLeads = baseFiltrada;
      }

      const currentGanhos = currentLeads.filter(l => l.status === 'ganho');
      const fatAtual = currentGanhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0);
      
      const calcCurrent = {
        faturamento: fatAtual,
        ticket: currentGanhos.length > 0 ? fatAtual / currentGanhos.length : 0,
        leads: currentLeads.length,
        conversao: currentLeads.length > 0 ? (currentGanhos.length / currentLeads.length) * 100 : 0
      };

      const lastGanhos = pastLeads.filter(l => l.status === 'ganho');
      const fatPassado = lastGanhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0);

      const calcLast = {
        faturamento: fatPassado,
        ticket: lastGanhos.length > 0 ? fatPassado / lastGanhos.length : 0,
        leads: pastLeads.length,
        conversao: pastLeads.length > 0 ? (lastGanhos.length / pastLeads.length) * 100 : 0
      };

      const undObj = currentGanhos.reduce((acc: any, lead) => {
          const und = lead.unidade || 'Sem Unidade Vinculada';
          if (!acc[und]) acc[und] = { nome: und, total: 0, count: 0 };
          acc[und].total += Number(lead.valor_total || 0);
          acc[und].count += 1;
          return acc;
      }, {});
      
      const calcUnidades = Object.values(undObj).map((u: any) => ({
          nome: u.nome, total: Number(u.total) || 0, count: Number(u.count) || 0
      })).sort((a, b) => b.total - a.total);

      // --- MOTOR DE VÍNCULO AVANÇADO (FUZZY MATCH) PARA O MAPA ---
      const cityObj = currentGanhos.reduce((acc: any, lead) => {
          
          // 1. Tenta achar pelo ID direto
          let rawCity = cidadesById[lead.client_id];
          
          // 2. Se não achar pelo ID, usa inteligência artificial para cruzar os nomes
          if (!rawCity) {
              // Pega o nome do lead em TODAS as variações (incluindo 'empresa cliente' com espaço)
              const rawLeadName = String(lead['empresa cliente'] || lead.empresa_cliente || lead.nome_empresa || lead.empresa || lead.cliente || lead.nome || '').trim().toUpperCase().replace(/\s+/g, ' ');
              
              if (rawLeadName && rawLeadName.length > 2) {
                  // Procura na base de clientes um nome que pareça com o do Lead
                  const clienteEncontrado = rawClientes.find(c => {
                      if (!c.nome_empresa) return false;
                      const cName = String(c.nome_empresa).trim().toUpperCase().replace(/\s+/g, ' ');
                      
                      // Match exato
                      if (cName === rawLeadName) return true;
                      // Match flexível: se o nome do lead está dentro do nome do cliente, ou vice-versa
                      if (rawLeadName.length > 4 && cName.includes(rawLeadName)) return true;
                      if (cName.length > 4 && rawLeadName.includes(cName)) return true;
                      
                      return false;
                  });

                  if (clienteEncontrado) {
                      rawCity = clienteEncontrado.cidade;
                  }
              }
          }

          rawCity = rawCity || 'NÃO INFORMADA';
          // Limpa o nome da cidade para tirar o "/ SC"
          const cleanCity = rawCity.split('/')[0].trim().toUpperCase(); 
          
          if (!acc[cleanCity]) acc[cleanCity] = { nome: cleanCity, total: 0, count: 0 };
          acc[cleanCity].total += Number(lead.valor_total || 0);
          acc[cleanCity].count += 1;
          return acc;
      }, {});

      const calcCidades = Object.values(cityObj).map((c: any) => ({
          nome: c.nome, total: Number(c.total) || 0, count: Number(c.count) || 0
      })).sort((a, b) => b.total - a.total);

      const curve = currentGanhos.reduce((acc: any, curr) => {
        let itensArray = [];
        if (Array.isArray(curr.itens)) itensArray = curr.itens;
        else if (typeof curr.itens === 'string') { try { itensArray = JSON.parse(curr.itens) || []; } catch(e) { itensArray = []; } }

        itensArray.forEach((item: any) => {
            if (item && item.servico) {
                acc[item.servico] = (acc[item.servico] || 0) + ((Number(item.precoUnitario) || 0) * (Number(item.quantidade) || 1));
            }
        });
        return acc;
      }, {});
      const calcCurva = Object.entries(curve).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));

      const rankObj = currentLeads.reduce((acc: any, lead) => {
         const nomeVendedor = lead.vendedor_nome || nomesMap[lead.user_id] || 'Sem Dono';
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
          nome: v.nome, total: Number(v.total) || 0, conversao: v.leadsCount > 0 ? (v.ganhosCount / v.leadsCount) * 100 : 0
      })).sort((a, b) => b.total - a.total);

      const calcImpacto = rawPremissas.map(p => {
          const leadsVinculados = currentLeads.filter(l => {
              return (p.titulo && l.checkin?.includes(p.titulo)) || l.checkin?.includes('Meta Gerada');
          });
          const ganhos = leadsVinculados.filter(l => l.status === 'ganho');
          
          return {
              titulo: p.titulo || 'Estratégia sem nome',
              tipo: p.tipo_cliente || 'Geral',
              gerados: leadsVinculados.length,
              conversao: leadsVinculados.length > 0 ? (ganhos.length / leadsVinculados.length) * 100 : 0,
              faturamento: ganhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0)
          };
      }).filter(est => est.gerados > 0).sort((a, b) => b.faturamento - a.faturamento).slice(0, 5); 

      return {
          currentMonth: calcCurrent,
          lastMonth: calcLast,
          servicosCurva: calcCurva,
          rankingVendedores: calcRanking,
          estrategiasImpacto: calcImpacto,
          performanceUnidades: calcUnidades,
          mapaCidades: calcCidades 
      };

  }, [rawLeads, rawPremissas, rawProfiles, rawClientes, filtroPeriodo, filtroUnidade, filtroVendedor]);

  const getGrowth = (current: number, last: number) => {
    if (last === 0) return current > 0 ? 100 : 0;
    return ((current - last) / last) * 100;
  };

  if (loading && !rawLeads.length) return <div className="h-screen flex items-center justify-center bg-[#0B1120] text-blue-500 font-black animate-pulse">COMPILANDO DADOS DA SALA DE COMANDO...</div>;

  return (
    <div className="p-6 space-y-6 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER INTEGRADO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Sala de Comando (BI)</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
            <ShieldCheck size={12} className="text-blue-500"/> Análise Estratégica e Inteligência Geográfica
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
          const isComparing = filtroPeriodo === 'Mês Atual' || filtroPeriodo === 'Mês Passado';
          const growth = isComparing && item.last !== undefined ? getGrowth(item.current, item.last) : null;
          
          return (
            <div key={i} className="bg-[#0B1120] border border-white/5 p-6 rounded-[32px] shadow-2xl relative overflow-hidden group hover:border-white/10 transition-all">
              <item.icon className={`absolute -right-4 -top-4 w-20 h-20 opacity-5 ${item.color}`} />
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{item.label}</p>
              <div className="flex items-end gap-2">
                <h3 className={`text-2xl font-black italic tracking-tighter ${item.color}`}>
                  {item.prefix}{(item.current || 0).toLocaleString('pt-BR', {maximumFractionDigits: 0})}{item.suffix}
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

      {/* 👇 NOVO: RADAR DE HEATMAP GEOGRÁFICO DE SANTA CATARINA 👇 */}
      <div className="bg-[#0B1120] border border-white/5 rounded-[40px] shadow-2xl overflow-hidden">
         <div className="p-8 border-b border-white/5 bg-white/[0.01]">
            <h3 className="text-white font-black uppercase italic flex items-center gap-2">
              <Globe2 size={20} className="text-emerald-500" /> Mapa de Calor Regional (SC)
            </h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Concentração Geográfica de Faturamento</p>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* Lista das Cidades (Tabela/Ranking) */}
            <div className="lg:col-span-1 p-8 border-r border-white/5 bg-white/[0.01] max-h-[400px] overflow-y-auto custom-scrollbar">
                <div className="space-y-6">
                    {mapaCidades.length > 0 ? mapaCidades.map((cid: any, idx: number) => {
                        const cidTotal = Number(cid.total) || 0;
                        const maxCidTotal = Number(mapaCidades[0]?.total) || 1;
                        const share = currentMonth.faturamento > 0 ? Math.round((cidTotal / currentMonth.faturamento) * 100) : 0;
                        
                        let heatColor = "bg-blue-500";
                        let textColor = "text-blue-400";
                        if (idx === 0) { heatColor = "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]"; textColor = "text-red-400"; }
                        else if (idx === 1 || idx === 2) { heatColor = "bg-orange-500"; textColor = "text-orange-400"; }

                        return (
                            <div key={cid.nome || idx} className="group">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-white font-black text-xs uppercase flex items-center gap-1">
                                        <MapPin size={10} className={textColor} />
                                        {cid.nome}
                                    </span>
                                    <span className={`${textColor} font-black text-[11px]`}>
                                        R$ {cidTotal.toLocaleString('pt-BR', { notation: 'compact' })}
                                    </span>
                                </div>
                                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                    <div className={`h-full ${heatColor} transition-all duration-1000`} style={{ width: `${Math.min((cidTotal / maxCidTotal) * 100, 100)}%` }} />
                                </div>
                                <div className="flex justify-between mt-1">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase">{cid.count} Vendas</p>
                                    <p className="text-[9px] text-slate-400 font-black uppercase">Share: {share}%</p>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-50 py-10">
                            <MapPin size={32} className="mb-2" />
                            <p className="text-xs font-black uppercase text-center">Sem dados de<br/>localização</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Visual Radar Map Area */}
            <div className="lg:col-span-2 relative h-[400px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0B1120] to-[#0B1120] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
                <div className="absolute w-[600px] h-[600px] border border-white/5 rounded-full"></div>
                <div className="absolute w-[400px] h-[400px] border border-white/5 rounded-full"></div>
                <div className="absolute w-[200px] h-[200px] border border-blue-500/10 rounded-full animate-pulse"></div>

                <div className="text-center absolute z-0 opacity-10 flex flex-col items-center pointer-events-none">
                    <Globe2 size={250} className="text-blue-500" />
                </div>

                <div className="relative w-full h-full max-w-[500px] max-h-[350px]">
                    {mapaCidades.map((cid: any, idx: number) => {
                        if (idx > 10) return null; 
                        const coords = getCityCoordinates(cid.nome);
                        if (!coords) return null; 

                        const isTop1 = idx === 0;
                        const isTop3 = idx > 0 && idx <= 2;
                        
                        return (
                            <div 
                                key={cid.nome} 
                                className="absolute flex flex-col items-center justify-center group"
                                style={{ top: coords.top, left: coords.left, transform: 'translate(-50%, -50%)' }}
                            >
                                {isTop1 && <div className="absolute w-12 h-12 bg-red-500/30 rounded-full animate-ping"></div>}
                                {isTop3 && <div className="absolute w-8 h-8 bg-orange-500/20 rounded-full animate-ping"></div>}

                                <div className={`relative z-10 w-3 h-3 rounded-full border-2 border-[#0B1120] ${isTop1 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)]' : isTop3 ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                                
                                <div className="absolute top-4 bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl">
                                    <p className="text-[10px] font-black text-white uppercase">{cid.nome}</p>
                                    <p className="text-[9px] font-bold text-[#22C55E]">R$ {Number(cid.total).toLocaleString('pt-BR', { notation: 'compact' })}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="absolute bottom-4 left-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-black/40 px-2 py-1 rounded">Radar Otimizado SC</div>
            </div>
         </div>
      </div>

      {/* BLOCO CENTRAL: CURVA ABC + PERFORMANCE DE VENDAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CURVA ABC */}
        <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl -mr-20 -mt-20" />
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-8 relative z-10">
            <PieChart size={20} className="text-blue-500" /> Curva ABC de Receita / Serviço
          </h3>
          
          <div className="space-y-6 relative z-10 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
            {servicosCurva.length > 0 ? servicosCurva.map(([nome, valor]: any, idx: number) => {
              const valorNum = Number(valor) || 0;
              const maxNum = Number(servicosCurva[0][1]) || 1;
              const share = currentMonth.faturamento > 0 ? Math.round((valorNum / currentMonth.faturamento) * 100) : 0;
              
              return (
                <div key={nome || idx}>
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className="text-[9px] text-slate-600 font-black uppercase">Tier {idx < 2 ? 'A' : idx < 4 ? 'B' : 'C'}</span>
                      <h4 className="text-white font-black uppercase italic text-sm">{nome || 'Serviços Diversos'}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-black text-sm">R$ {valorNum.toLocaleString('pt-BR')}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Share: {share}%</p>
                    </div>
                  </div>
                  <ProgressBar value={valorNum} max={maxNum} color={idx === 0 ? 'bg-blue-500' : 'bg-white/10'} />
                </div>
              );
            }) : <p className="text-slate-600 text-xs italic font-bold uppercase flex items-center gap-2"><AlertCircle size={14}/> Nenhum item detalhado neste período.</p>}
          </div>
        </div>

        {/* RANKING PERMANENTE */}
        <div className="bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl flex flex-col">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-8">
            <Users size={20} className="text-purple-500" /> Elite de Vendas
          </h3>
          <div className="space-y-6 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar pr-2">
            {rankingVendedores.length > 0 ? rankingVendedores.map((vend: any, idx: number) => {
              const vendTotal = Number(vend.total) || 0;
              const maxVendTotal = Number(rankingVendedores[0]?.total) || 1;
              
              return (
                <div key={vend.nome || idx} className="flex items-center gap-4 group">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black italic shadow-lg flex-shrink-0 ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-slate-500 border border-white/10'}`}>
                    {idx + 1}º
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-white font-black text-xs uppercase group-hover:text-purple-400 transition-colors truncate pr-2">{vend.nome || 'Sem Nome'}</span>
                      <span className="text-[#22C55E] font-black text-[10px] whitespace-nowrap">R$ {vendTotal.toLocaleString('pt-BR', { notation: 'compact' })}</span>
                    </div>
                    <ProgressBar value={vendTotal} max={maxVendTotal} color="bg-purple-600" />
                    <p className="text-[9px] text-slate-600 font-bold mt-1 uppercase">Conversão: {Math.round(vend.conversao || 0)}%</p>
                  </div>
                </div>
              );
            }) : <p className="text-slate-600 text-xs italic font-bold uppercase">Sem vendas registradas.</p>}
          </div>
        </div>
      </div>

      {/* BLOCO INFERIOR: ESTRATÉGIAS + PERFORMANCE DE UNIDADES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* TABELA DE ESTRATÉGIAS */}
        <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl flex flex-col">
          <div className="p-8 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
            <h3 className="text-white font-black uppercase italic flex items-center gap-2">
              <BarChart3 size={20} className="text-[#22C55E]" /> ROI de Estratégias (Premissas)
            </h3>
            <span className="text-[10px] text-blue-500 font-black uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full">{filtroPeriodo}</span>
          </div>
          <div className="overflow-x-auto flex-1">
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
                          {est.titulo?.includes('Resgate') ? <Sparkles size={14} className="text-purple-500"/> : <Crosshair size={14} className="text-blue-500"/>}
                          <span className="text-white font-bold text-sm uppercase italic group-hover:text-[#22C55E] transition-colors">{est.titulo}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-1 rounded-md font-black uppercase">{est.tipo || 'Vendas'}</span>
                    </td>
                    <td className="px-8 py-5 text-center text-white font-black">{est.gerados || 0}</td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex flex-col items-center">
                          <span className={`text-[10px] font-black uppercase ${(est.conversao || 0) > 10 ? 'text-[#22C55E]' : 'text-slate-500'}`}>{Math.round(est.conversao || 0)}%</span>
                          <div className="w-12 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-[#22C55E]" style={{ width: `${est.conversao || 0}%` }} />
                          </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right text-[#22C55E] font-black italic">R$ {(est.faturamento || 0).toLocaleString('pt-BR')}</td>
                  </tr>
                )) : (
                  <tr>
                      <td colSpan={5} className="px-8 py-10 text-center text-slate-600 text-xs font-black uppercase flex flex-col items-center justify-center">
                          <Target size={24} className="mb-2 opacity-20"/>
                          Nenhuma estratégia gerou resultado neste filtro.
                      </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PERFORMANCE POR UNIDADE */}
        <div className="bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl flex flex-col">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-8">
            <Building2 size={20} className="text-cyan-400" /> Faturamento por Filial
          </h3>
          <div className="space-y-6 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar pr-2">
            {performanceUnidades.length > 0 ? performanceUnidades.map((und: any, idx: number) => {
              const undTotal = Number(und.total) || 0;
              const maxUndTotal = Number(performanceUnidades[0]?.total) || 1;
              const share = currentMonth.faturamento > 0 ? Math.round((undTotal / currentMonth.faturamento) * 100) : 0;

              return (
                <div key={und.nome || idx}>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-white font-black text-xs uppercase truncate pr-2 max-w-[60%]">{und.nome}</span>
                    <span className="text-cyan-400 font-black text-[11px] whitespace-nowrap">R$ {undTotal.toLocaleString('pt-BR', { notation: 'compact' })}</span>
                  </div>
                  <ProgressBar value={undTotal} max={maxUndTotal} color="bg-cyan-500" />
                  <div className="flex justify-between mt-1">
                      <p className="text-[9px] text-slate-500 font-bold uppercase">{und.count} Vendas</p>
                      <p className="text-[9px] text-slate-400 font-black uppercase">Share: {share}%</p>
                  </div>
                </div>
              );
            }) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-50">
                    <Building2 size={32} className="mb-2" />
                    <p className="text-xs font-black uppercase">Sem dados de filiais</p>
                </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}