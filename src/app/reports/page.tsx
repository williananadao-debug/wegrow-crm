"use client";
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  TrendingUp, BarChart3, PieChart, Users, 
  ArrowUpRight, ArrowDownRight, Target, Calendar,
  Download, Zap, Clock, ChevronRight, Filter, 
  ShieldCheck, Crosshair, Sparkles, Building2, AlertCircle, MapPin,
  FileSpreadsheet, Database, X, Briefcase
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

// LIMPACOR DE NOMES PARA A INTELIGÊNCIA GEOGRÁFICA
const normalizeString = (str: string) => {
    if (!str) return '';
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^\w\s]/gi, '') 
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' '); 
};

// --- MOTOR DE EXPORTAÇÃO CSV ---
const convertToCSV = (objArray: any[]) => {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    
    if (array.length > 0) {
        let row = '';
        for (let index in array[0]) {
            row += '"' + index + '";';
        }
        row = row.slice(0, -1);
        str += row + '\r\n';
    }
    
    for (let i = 0; i < array.length; i++) {
        let line = '';
        for (let index in array[i]) {
            let val = array[i][index] !== null && array[i][index] !== undefined ? array[i][index] : '';
            if (typeof val === 'object') val = JSON.stringify(val);
            val = String(val).replace(/"/g, '""'); // Escapa aspas
            line += '"' + val + '";';
        }
        line = line.slice(0, -1);
        str += line + '\r\n';
    }
    return str;
};

const downloadFile = (content: string, fileName: string) => {
    // O \ufeff força o Excel a entender UTF-8 (acentos corretos)
    const blob = new Blob(["\ufeff", content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  // Estados do Modal de Exportação
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('leads');
  const [isExporting, setIsExporting] = useState(false);

  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => { 
      if (user) fetchReportData(); 
  }, [user, perfil]);

  async function fetchReportData() {
    setLoading(true);
    try {
      let leadsQuery = supabase.from('leads').select('*').limit(10000);
      
      if (!isDirector) {
          leadsQuery = leadsQuery.or(`user_id.eq.${user?.id},vendedor_nome.ilike.%${perfil?.nome}%`);
      }

      const [leadsRes, premissasRes, profilesRes] = await Promise.all([
        leadsQuery,
        supabase.from('premissas').select('*').limit(1000),
        supabase.from('profiles').select('id, nome'),
      ]);

      // TRATOR: BUSCANDO TODOS OS CLIENTES SEM LIMITES
      let allClientes: any[] = [];
      let page = 0;
      let fetchMore = true;
      
      while(fetchMore) {
          const { data, error } = await supabase
              .from('clientes')
              .select('*')
              .range(page * 1000, (page + 1) * 1000 - 1);
              
          if (data && data.length > 0) {
              allClientes = [...allClientes, ...data];
              page++;
          } else {
              fetchMore = false; 
          }
      }

      setRawLeads(leadsRes.data || []);
      setRawPremissas(premissasRes.data || []);
      setRawProfiles(profilesRes.data || []);
      setRawClientes(allClientes); 
      
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally { 
      setLoading(false); 
    }
  }

  // --- FUNÇÃO CENTRAL DE EXPORTAÇÃO ---
  const handleExport = async () => {
      setIsExporting(true);
      try {
          // 👇 O Ajuste do TypeScript está aqui:
          let dataToExport: any[] = []; 
          const timestamp = new Date().toISOString().split('T')[0];
          let filename = `extracao_${exportType}_${timestamp}.csv`;

          if (exportType === 'leads') {
              // Prepara dados de VENDAS
              dataToExport = rawLeads.map(l => ({
                  ID_Venda: l.id,
                  Data_Criacao: l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '',
                  Cliente: l.empresa || 'Sem nome',
                  Valor_Total: Number(l.valor_total || 0).toFixed(2).replace('.', ','),
                  Status: l.status || '',
                  Fase_Funil: l.etapa || 0,
                  Unidade: l.unidade || 'Não informada',
                  Vendedor: l.vendedor_nome || rawProfiles.find(p => p.id === l.user_id)?.nome || 'Sem dono',
                  Inicio_Contrato: l.contrato_inicio ? new Date(l.contrato_inicio).toLocaleDateString('pt-BR') : '',
                  Fim_Contrato: l.contrato_fim ? new Date(l.contrato_fim).toLocaleDateString('pt-BR') : '',
              }));

          } else if (exportType === 'clientes') {
              // Prepara dados de CLIENTES
              dataToExport = rawClientes.map(c => ({
                  ID_Cliente: c.id,
                  Nome_Fantasia: c.nome_empresa || '',
                  CNPJ: c.cnpj || '',
                  Telefone: c.telefone || '',
                  Email: c.email || '',
                  Cidade: c.cidade || c.cidade_uf || '',
                  Bairro: c.bairro || '',
                  Status: c.status || 'Ativo'
              }));

          } else if (exportType === 'jobs') {
              // Busca JOBS (Produção) no banco com Trator
              let allJobs: any[] = [];
              let page = 0;
              let fetchMore = true;
              while(fetchMore) {
                  const { data } = await supabase.from('jobs').select('*').range(page * 1000, (page + 1) * 1000 - 1);
                  if (data && data.length > 0) { allJobs = [...allJobs, ...data]; page++; } 
                  else { fetchMore = false; }
              }
              dataToExport = allJobs.map(j => ({
                  ID_Job: j.id,
                  Data_Criacao: j.created_at ? new Date(j.created_at).toLocaleDateString('pt-BR') : '',
                  Titulo: j.titulo || '',
                  Fase_Producao: j.stage || '',
                  Prioridade: j.prioridade || '',
                  Prazo_Entrega: j.deadline ? new Date(j.deadline).toLocaleDateString('pt-BR') : '',
                  Aprovado: j.aprovado_cliente ? 'SIM' : 'NÃO'
              }));
          }

          if (dataToExport.length === 0) {
              alert("Não há dados para exportar neste módulo.");
              setIsExporting(false);
              return;
          }

          const csvContent = convertToCSV(dataToExport);
          downloadFile(csvContent, filename);
          setShowExportModal(false);

      } catch (error) {
          console.error("Erro na exportação:", error);
          alert("Ocorreu um erro ao gerar o arquivo.");
      } finally {
          setIsExporting(false);
      }
  };

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
      
      const cidadesById = rawClientes.reduce((acc: any, c) => ({ ...acc, [c.id]: (c.cidade || c.cidade_uf || c.bairro) }), {});

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

      // --- MOTOR DE VÍNCULO GEOGRÁFICO ---
      const cityObj = currentGanhos.reduce((acc: any, lead) => {
          let rawCity = cidadesById[lead.client_id];
          
          if (!rawCity) {
              const rawLeadName = lead.nome_empresa || lead['empresa cliente'] || lead.empresa_cliente || lead.cliente_nome || lead.nome_cliente || lead.nome || lead.empresa || lead.cliente || '';
              const cleanLeadName = normalizeString(rawLeadName as string);
              
              if (cleanLeadName && cleanLeadName.length >= 3) {
                  const clienteEncontrado = rawClientes.find(c => {
                      if (!c.nome_empresa) return false;
                      const cName = normalizeString(c.nome_empresa);
                      if (cName === cleanLeadName) return true;
                      if (cName.includes(cleanLeadName)) return true;
                      if (cleanLeadName.includes(cName)) return true;
                      return false;
                  });

                  if (clienteEncontrado) {
                      rawCity = clienteEncontrado.cidade || clienteEncontrado.cidade_uf || clienteEncontrado.bairro;
                  }
              }
          }
          
          if (!rawCity) rawCity = lead.cidade || lead.cidade_uf;

          rawCity = rawCity || 'NÃO INFORMADA';
          const cleanCity = String(rawCity).split('/')[0].split('-')[0].trim().toUpperCase(); 
          
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
            <ShieldCheck size={12} className="text-blue-500"/> Análise Estratégica e Inteligência de Dados
          </p>
        </div>
        
        {/* 👇 BOTÕES DO TOPO (NOVO BOTÃO DE EXTRAÇÃO AQUI) 👇 */}
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={fetchReportData} className="bg-white/5 border border-white/10 text-slate-400 p-3 rounded-xl hover:text-white transition-all shadow-lg flex-shrink-0" title="Atualizar Dados">
            <Zap size={18}/>
          </button>
          
          {/* BOTÃO MESTRE DE EXTRAÇÃO DE DADOS */}
          <button onClick={() => setShowExportModal(true)} className="bg-purple-600/20 hover:bg-purple-600 border border-purple-500/30 text-purple-400 hover:text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all whitespace-nowrap">
            <Database size={16}/> Extrair Dados
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

      {/* COMPARATIVOS KPI */}
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

      {/* BLOCO 1: CURVA ABC + ELITE DE VENDAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CURVA ABC (Ocupa 2 colunas) */}
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

        {/* RANKING PERMANENTE (Ocupa 1 coluna) */}
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

      {/* BLOCO 2: ESTRATÉGIAS + PERFORMANCE DE UNIDADES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* TABELA DE ESTRATÉGIAS (Ocupa 2 colunas) */}
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

        {/* PERFORMANCE POR UNIDADE (Ocupa 1 coluna) */}
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

      {/* BLOCO 3: DESEMPENHO GEOGRÁFICO PURO E RÁPIDO */}
      <div className="bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl">
         <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-white font-black uppercase italic flex items-center gap-2">
                <MapPin size={20} className="text-emerald-500" /> Desempenho Geográfico (Cidades)
              </h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Concentração de Receita por Região</p>
            </div>
            <span className="bg-white/5 text-slate-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border border-white/10 hidden md:block">
              {mapaCidades.length} Regiões Atingidas
            </span>
         </div>

         <div className="max-h-[350px] overflow-y-auto custom-scrollbar pr-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6">
                {mapaCidades.length > 0 ? mapaCidades.map((cid: any, idx: number) => {
                    const cidTotal = Number(cid.total) || 0;
                    const maxCidTotal = Number(mapaCidades[0]?.total) || 1;
                    const share = currentMonth.faturamento > 0 ? Math.round((cidTotal / currentMonth.faturamento) * 100) : 0;
                    
                    let heatColor = "bg-blue-500";
                    let textColor = "text-blue-400";
                    if (cid.nome === 'NÃO INFORMADA') { heatColor = "bg-red-500 opacity-50"; textColor = "text-red-400"; }
                    else if (idx === 0) { heatColor = "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"; textColor = "text-emerald-400"; }
                    else if (idx === 1 || idx === 2) { heatColor = "bg-orange-500"; textColor = "text-orange-400"; }

                    return (
                        <div key={cid.nome || idx} className="group">
                            <div className="flex justify-between items-end mb-1">
                                <span className="text-white font-black text-xs uppercase flex items-center gap-1 truncate pr-2">
                                    <MapPin size={10} className={textColor} />
                                    {cid.nome}
                                </span>
                                <span className={`${textColor} font-black text-[11px] whitespace-nowrap`}>
                                    R$ {cidTotal.toLocaleString('pt-BR', { notation: 'compact' })}
                                </span>
                            </div>
                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                <div className={`h-full ${heatColor} transition-all duration-1000`} style={{ width: `${Math.min((cidTotal / maxCidTotal) * 100, 100)}%` }} />
                            </div>
                            <div className="flex justify-between mt-1">
                                <p className="text-[9px] text-slate-500 font-bold uppercase">{cid.count} Vendas</p>
                                <p className="text-[9px] text-slate-400 font-black uppercase">Share: {share}%</p>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="col-span-full flex flex-col items-center justify-center text-slate-600 opacity-50 py-10">
                        <MapPin size={32} className="mb-2" />
                        <p className="text-xs font-black uppercase text-center">Sem dados de localização cadastrados.</p>
                    </div>
                )}
            </div>
         </div>
      </div>

      {/* 👇 MODAL DE EXPORTAÇÃO DE DADOS (NOVO) 👇 */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-white/10 w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
                            <Database size={20} className="text-purple-500"/> Exportar Dados
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Extração para Excel (.CSV)</p>
                    </div>
                    <button onClick={() => setShowExportModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={20}/>
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    <p className="text-xs text-slate-400 font-medium">Selecione o módulo que deseja extrair. O sistema compilará toda a base de dados em uma tabela bruta para você fazer análises dinâmicas em planilhas.</p>

                    <div className="grid grid-cols-1 gap-3">
                        <label className={`cursor-pointer flex items-center p-4 rounded-2xl border-2 transition-all ${exportType === 'leads' ? 'bg-blue-600/10 border-blue-500' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                            <input type="radio" name="exportModule" value="leads" checked={exportType === 'leads'} onChange={(e) => setExportType(e.target.value)} className="hidden" />
                            <Target size={24} className={exportType === 'leads' ? 'text-blue-500' : 'text-slate-500'} />
                            <div className="ml-4">
                                <h4 className={`font-black uppercase text-sm ${exportType === 'leads' ? 'text-white' : 'text-slate-300'}`}>1. Vendas (Oportunidades)</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">Tabela com todos os funis, valores, vendedores e contratos.</p>
                            </div>
                        </label>

                        <label className={`cursor-pointer flex items-center p-4 rounded-2xl border-2 transition-all ${exportType === 'clientes' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                            <input type="radio" name="exportModule" value="clientes" checked={exportType === 'clientes'} onChange={(e) => setExportType(e.target.value)} className="hidden" />
                            <Users size={24} className={exportType === 'clientes' ? 'text-emerald-500' : 'text-slate-500'} />
                            <div className="ml-4">
                                <h4 className={`font-black uppercase text-sm ${exportType === 'clientes' ? 'text-white' : 'text-slate-300'}`}>2. Base de Clientes</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">Cadastro completo com CNPJ, cidades, emails e telefones.</p>
                            </div>
                        </label>

                        <label className={`cursor-pointer flex items-center p-4 rounded-2xl border-2 transition-all ${exportType === 'jobs' ? 'bg-orange-500/10 border-orange-500' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                            <input type="radio" name="exportModule" value="jobs" checked={exportType === 'jobs'} onChange={(e) => setExportType(e.target.value)} className="hidden" />
                            <Briefcase size={24} className={exportType === 'jobs' ? 'text-orange-500' : 'text-slate-500'} />
                            <div className="ml-4">
                                <h4 className={`font-black uppercase text-sm ${exportType === 'jobs' ? 'text-white' : 'text-slate-300'}`}>3. Produção (Jobs)</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">Tabela com roteiros, gravações e prazos de entrega.</p>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 bg-white/[0.01]">
                    <button 
                        onClick={handleExport} 
                        disabled={isExporting}
                        className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all ${isExporting ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]'}`}
                    >
                        {isExporting ? (
                            <><Zap size={16} className="animate-spin"/> COMPILANDO BASE...</>
                        ) : (
                            <><FileSpreadsheet size={16}/> BAIXAR ARQUIVO .CSV</>
                        )}
                    </button>
                </div>

            </div>
        </div>
      )}

    </div>
  );
}