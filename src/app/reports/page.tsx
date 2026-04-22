"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  TrendingUp, BarChart3, PieChart, Users,
  ArrowUpRight, ArrowDownRight, Target, Calendar,
  Download, Zap, Clock, ChevronRight, Filter,
  ShieldCheck, Crosshair, Sparkles, Building2, AlertCircle, MapPin,
  FileSpreadsheet, Database, X, Briefcase, Eye, ArrowLeft, CalendarDays, CheckCircle2
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

const getLocalYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const convertToCSV = (objArray: any[]) => {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    if (array.length > 0) {
        let row = '';
        for (let index in array[0]) { row += '"' + index + '";'; }
        row = row.slice(0, -1); str += row + '\r\n';
    }
    for (let i = 0; i < array.length; i++) {
        let line = '';
        for (let index in array[i]) {
            let val = array[i][index] !== null && array[i][index] !== undefined ? array[i][index] : '';
            if (typeof val === 'object') val = JSON.stringify(val);
            val = String(val).replace(/"/g, '""'); line += '"' + val + '";';
        }
        line = line.slice(0, -1); str += line + '\r\n';
    }
    return str;
};

const downloadFile = (content: string, fileName: string) => {
    const blob = new Blob(["\ufeff", content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); const url = URL.createObjectURL(blob);
    link.setAttribute("href", url); link.setAttribute("download", fileName);
    link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

export default function ReportsPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const mostrarFinanceiro = Boolean(empresa?.modulos?.financeiro);
  const [loading, setLoading] = useState(true);
  
  const [dataInicio, setDataInicio] = useState(() => {
      const hoje = new Date(); const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1); return getLocalYYYYMMDD(primeiroDia);
  });
  
  const [dataFim, setDataFim] = useState(() => {
      const hoje = new Date(); const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0); return getLocalYYYYMMDD(ultimoDia);
  });

  const [filtroUnidade, setFiltroUnidade] = useState<string>('Todas');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('Todos');

  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [rawPremissas, setRawPremissas] = useState<any[]>([]);
  const [rawProfiles, setRawProfiles] = useState<any[]>([]);
  const [rawClientes, setRawClientes] = useState<any[]>([]); 

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('leads');
  const [isExporting, setIsExporting] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);

  const isDirector = perfil?.cargo === 'diretor';
  const isGerente = perfil?.cargo === 'gerente';

  useEffect(() => { if (user) fetchReportData(); }, [user, perfil]);

  async function fetchReportData() {
    setLoading(true);
    try {
      let leadsQuery = supabase.from('leads').select('id, empresa, valor_total, status, unidade, user_id, vendedor_nome, created_at, origem, checkin, descricao, client_id, contrato_inicio, contrato_fim, etapa, itens, tipo').order('created_at', { ascending: false }).limit(5000);
      if (perfil?.empresa_id) leadsQuery = leadsQuery.eq('empresa_id', perfil.empresa_id);
      if (isGerente && perfil?.unidade) { leadsQuery = leadsQuery.eq('unidade', perfil.unidade); }
      else if (!isDirector) { leadsQuery = leadsQuery.eq('user_id', user?.id); }

      let clientesQuery = supabase.from('clientes').select('id, nome_empresa, cidade, bairro, telefone, email, cnpj, status').order('id', { ascending: false }).limit(2000);
      if (perfil?.empresa_id) clientesQuery = clientesQuery.eq('empresa_id', perfil.empresa_id);

      const [leadsRes, premissasRes, profilesRes, clientesRes] = await Promise.all([
        leadsQuery,
        supabase.from('premissas').select('titulo, tipo_cliente').limit(1000),
        perfil?.empresa_id
          ? supabase.from('profiles').select('id, nome').eq('empresa_id', perfil.empresa_id)
          : supabase.from('profiles').select('id, nome'),
        clientesQuery,
      ]);

      setRawLeads(leadsRes.data || []); setRawPremissas(premissasRes.data || []); setRawProfiles(profilesRes.data || []); setRawClientes(clientesRes.data || []);
    } catch (error) { console.error("Erro ao buscar dados:", error); } finally { setLoading(false); }
  }

  const { currentMonth, lastMonth, rankingVendedores, servicosCurva, estrategiasImpacto, performanceUnidades, mapaCidades, vendasPorDia, currentLeadsBase, visitasFunil, graficoMensal, inadimplentes } = useMemo(() => {
      const nomesMap = rawProfiles.reduce((acc: any, p) => ({ ...acc, [p.id]: p.nome }), {});
      const cidadesById = rawClientes.reduce((acc: any, c) => ({ ...acc, [c.id]: (c.cidade || c.bairro) }), {});
      const clientesNormalizados = rawClientes.map(c => ({ ...c, normName: normalizeString(c.nome_empresa) })).filter(c => c.normName);

      const baseFiltrada = rawLeads.filter(lead => {
          if (isGerente && lead.unidade !== perfil?.unidade) return false;
          if (!isGerente && filtroUnidade !== 'Todas' && lead.unidade !== filtroUnidade) return false;
          if (filtroVendedor !== 'Todos' && lead.user_id !== filtroVendedor && lead.vendedor_nome !== filtroVendedor) return false;
          return true;
      });

      const start = new Date(dataInicio + 'T12:00:00'); const end = new Date(dataFim + 'T12:00:00');
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const pastEnd = new Date(start); pastEnd.setDate(start.getDate() - 1);
      const pastStart = new Date(pastEnd); pastStart.setDate(pastEnd.getDate() - diffDays);
      const strPastStart = getLocalYYYYMMDD(pastStart); const strPastEnd = getLocalYYYYMMDD(pastEnd);

      const currentLeads = baseFiltrada.filter(l => { const d = l.created_at?.substring(0, 10); return d >= dataInicio && d <= dataFim; });
      const pastLeads = baseFiltrada.filter(l => { const d = l.created_at?.substring(0, 10); return d >= strPastStart && d <= strPastEnd; });

      const currentGanhos = currentLeads.filter(l => l.status === 'ganho'); const fatAtual = currentGanhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0);
      const calcCurrent = { faturamento: fatAtual, ticket: currentGanhos.length > 0 ? fatAtual / currentGanhos.length : 0, leads: currentLeads.length, conversao: currentLeads.length > 0 ? (currentGanhos.length / currentLeads.length) * 100 : 0 };

      const lastGanhos = pastLeads.filter(l => l.status === 'ganho'); const fatPassado = lastGanhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0);
      const calcLast = { faturamento: fatPassado, ticket: lastGanhos.length > 0 ? fatPassado / lastGanhos.length : 0, leads: pastLeads.length, conversao: pastLeads.length > 0 ? (lastGanhos.length / pastLeads.length) * 100 : 0 };

      const undObj = currentGanhos.reduce((acc: any, lead) => { const und = lead.unidade || 'Sem Unidade Vinculada'; if (!acc[und]) acc[und] = { nome: und, total: 0, count: 0 }; acc[und].total += Number(lead.valor_total || 0); acc[und].count += 1; return acc; }, {});
      const calcUnidades = Object.values(undObj).map((u: any) => ({ nome: u.nome, total: Number(u.total) || 0, count: Number(u.count) || 0 })).sort((a: any, b: any) => b.total - a.total);

      const cityObj = currentGanhos.reduce((acc: any, lead) => {
          let rawCity = lead.cidade; if (!rawCity && lead.client_id) rawCity = cidadesById[lead.client_id];
          if (!rawCity) { 
              const rawLeadName = lead.empresa || ''; const cleanLeadName = normalizeString(rawLeadName as string);
              if (cleanLeadName && cleanLeadName.length >= 3) { const clienteEncontrado = clientesNormalizados.find(c => c.normName === cleanLeadName || c.normName.includes(cleanLeadName) || cleanLeadName.includes(c.normName)); if (clienteEncontrado) rawCity = clienteEncontrado.cidade || clienteEncontrado.bairro; }
          }
          rawCity = rawCity || 'NÃO INFORMADA'; let cleanCity = String(rawCity).split('/')[0].split('-')[0].trim().toUpperCase(); cleanCity = cleanCity.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (!acc[cleanCity]) acc[cleanCity] = { nome: cleanCity, total: 0, count: 0 };
          acc[cleanCity].total += Number(lead.valor_total || 0); acc[cleanCity].count += 1; return acc;
      }, {});
      const calcCidades = Object.values(cityObj).map((c: any) => ({ nome: c.nome, total: Number(c.total) || 0, count: Number(c.count) || 0 })).sort((a: any, b: any) => b.total - a.total);

      const diasSemanaNomes = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
      const diaObj = diasSemanaNomes.reduce((acc: any, nome, idx) => { acc[nome] = { nome, total: 0, count: 0, idx }; return acc; }, {});
      currentGanhos.forEach((lead: any) => { if (!lead.created_at) return; const diaIdx = new Date(lead.created_at).getDay(); const nomeDia = diasSemanaNomes[diaIdx]; if (diaObj[nomeDia]) { diaObj[nomeDia].total += Number(lead.valor_total || 0); diaObj[nomeDia].count += 1; } });
      const calcDiasSemana = Object.values(diaObj).sort((a: any, b: any) => a.idx - b.idx);

      const curve = currentGanhos.reduce((acc: any, curr) => {
        let itensArray = []; if (Array.isArray(curr.itens)) itensArray = curr.itens; else if (typeof curr.itens === 'string') { try { itensArray = JSON.parse(curr.itens) || []; } catch(e) { itensArray = []; } }
        itensArray.forEach((item: any) => { if (item && item.servico) { acc[item.servico] = (acc[item.servico] || 0) + ((Number(item.precoUnitario) || 0) * (Number(item.quantidade) || 1)); } }); return acc;
      }, {});
      const calcCurva = Object.entries(curve).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));

      const rankObj = currentLeads.reduce((acc: any, lead) => {
         const nomeVendedor = lead.vendedor_nome || nomesMap[lead.user_id] || 'Sem Dono'; const chave = lead.vendedor_nome ? lead.vendedor_nome : (lead.user_id || 'sem_dono');
         if (!acc[chave]) acc[chave] = { id: chave, nome: nomeVendedor, total: 0, leadsCount: 0, ganhosCount: 0 };
         acc[chave].leadsCount += 1; if (lead.status === 'ganho') { acc[chave].total += (Number(lead.valor_total) || 0); acc[chave].ganhosCount += 1; } return acc;
      }, {});
      const calcRanking = Object.values(rankObj).map((v: any) => ({ nome: v.nome, total: Number(v.total) || 0, conversao: v.leadsCount > 0 ? (v.ganhosCount / v.leadsCount) * 100 : 0 })).sort((a: any, b: any) => b.total - a.total);

      const leadsJaContabilizados = new Set();
      let estrategiasProcessadas = rawPremissas.map(p => {
          if (!p.titulo) return null; const tituloLower = p.titulo.toLowerCase().trim();
          const leadsVinculados = currentLeads.filter(l => {
              if (leadsJaContabilizados.has(l.id)) return false; const origem = (l.origem || '').toLowerCase(); const desc = (l.descricao || '').toLowerCase(); const check = (l.checkin || '').toLowerCase();
              const matched = origem.includes(tituloLower) || desc.includes(tituloLower) || check.includes(tituloLower);
              if (matched) leadsJaContabilizados.add(l.id); return matched;
          });
          const ganhos = leadsVinculados.filter(l => l.status === 'ganho');
          return { titulo: p.titulo, tipo: p.tipo_cliente || 'Geral', gerados: leadsVinculados.length, conversao: leadsVinculados.length > 0 ? (ganhos.length / leadsVinculados.length) * 100 : 0, faturamento: ganhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0) };
      }).filter(Boolean);

      const leadsEstrategiaGenerica = currentLeads.filter(l => { return !leadsJaContabilizados.has(l.id) && l.origem === 'Estratégia'; });
      if (leadsEstrategiaGenerica.length > 0) {
          const ganhos = leadsEstrategiaGenerica.filter(l => l.status === 'ganho');
          estrategiasProcessadas.push({ titulo: 'Outras Campanhas / Diversos', tipo: 'Estratégia Avulsa', gerados: leadsEstrategiaGenerica.length, conversao: leadsEstrategiaGenerica.length > 0 ? (ganhos.length / leadsEstrategiaGenerica.length) * 100 : 0, faturamento: ganhos.reduce((acc, curr) => acc + Number(curr.valor_total || 0), 0) });
      }
      const calcImpacto = estrategiasProcessadas.filter((est: any) => est.gerados > 0).sort((a: any, b: any) => b.faturamento - a.faturamento).slice(0, 5); 

      const visitasBase = currentLeads.filter(l => l.tipo === 'visita');
      const visitasConvertidas = visitasBase.filter(l => Number(l.etapa) > 0);
      const visitasGanhas = visitasBase.filter(l => l.status === 'ganho');

      const visitasPorVendedor = Object.values(currentLeads.filter(l => l.tipo === 'visita').reduce((acc: any, l) => {
          const chave = l.user_id || l.vendedor_nome || 'sem_dono';
          const nome = l.vendedor_nome || nomesMap[l.user_id] || 'Desconhecido';
          if (!acc[chave]) acc[chave] = { nome, total: 0, convertidas: 0, ganhas: 0 };
          acc[chave].total++;
          if (Number(l.etapa) > 0) acc[chave].convertidas++;
          if (l.status === 'ganho') acc[chave].ganhas++;
          return acc;
      }, {})).sort((a: any, b: any) => b.total - a.total) as { nome: string; total: number; convertidas: number; ganhas: number }[];

      const calcVisitas = { total: visitasBase.length, convertidas: visitasConvertidas.length, ganhas: visitasGanhas.length, porVendedor: visitasPorVendedor };

      // Gráfico mensal - últimos 6 meses
      const hoje = new Date();
      const graficoMensal = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
          const ano = d.getFullYear(); const mes = d.getMonth() + 1;
          const label = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
          const isCurrent = i === 5;
          const mesStr = String(mes).padStart(2, '0');
          const ganhos = baseFiltrada.filter(l => {
              const dt = l.created_at?.substring(0, 7);
              return l.status === 'ganho' && dt === `${ano}-${mesStr}`;
          });
          return { label, valor: ganhos.reduce((s, l) => s + Number(l.valor_total || 0), 0), isCurrent };
      });

      // Inadimplência: contratos vencidos (ganho + contrato_fim < hoje)
      const hoje2 = getLocalYYYYMMDD(new Date());
      const inadimplentes = baseFiltrada.filter(l =>
          l.status === 'ganho' && l.contrato_fim && l.contrato_fim.substring(0, 10) < hoje2
      ).map(l => ({
          empresa: l.empresa,
          unidade: l.unidade || 'N/A',
          valor: Number(l.valor_total || 0),
          venceu: l.contrato_fim.substring(0, 10),
          diasVencido: Math.floor((new Date().getTime() - new Date(l.contrato_fim + 'T00:00:00').getTime()) / 86400000),
          vendedor: l.vendedor_nome || rawProfiles.find((p: any) => p.id === l.user_id)?.nome || 'N/A',
      })).sort((a, b) => b.diasVencido - a.diasVencido);

      return { currentMonth: calcCurrent, lastMonth: calcLast, servicosCurva: calcCurva, rankingVendedores: calcRanking, estrategiasImpacto: calcImpacto, performanceUnidades: calcUnidades, mapaCidades: calcCidades, vendasPorDia: calcDiasSemana, currentLeadsBase: currentLeads, visitasFunil: calcVisitas, graficoMensal, inadimplentes };
  }, [rawLeads, rawPremissas, rawProfiles, rawClientes, dataInicio, dataFim, filtroUnidade, filtroVendedor]);

  const handleGeneratePreview = async () => {
      setIsExporting(true);
      try {
          let dataToExport: any[] = []; 
          if (exportType === 'leads') {
              dataToExport = currentLeadsBase.map(l => ({ ID_Venda: l.id, Data_Criacao: l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '', Cliente: l.empresa || 'Sem nome', Valor_Total: Number(l.valor_total || 0).toFixed(2).replace('.', ','), Status: l.status || '', Fase_Funil: l.etapa || 0, Origem: l.origem || 'Manual', Unidade: l.unidade || 'Não informada', Vendedor: l.vendedor_nome || rawProfiles.find(p => p.id === l.user_id)?.nome || 'Sem dono', Inicio_Contrato: l.contrato_inicio ? new Date(l.contrato_inicio).toLocaleDateString('pt-BR') : '', Fim_Contrato: l.contrato_fim ? new Date(l.contrato_fim).toLocaleDateString('pt-BR') : '' }));
          } else if (exportType === 'clientes') {
              dataToExport = rawClientes.map(c => ({ ID_Cliente: c.id, Nome_Fantasia: c.nome_empresa || '', CNPJ: c.cnpj || '', Telefone: c.telefone || '', Email: c.email || '', Cidade: c.cidade || '', Bairro: c.bairro || '', Status: c.status || 'Ativo' }));
          } else if (exportType === 'jobs') {
              let allJobs: any[] = []; let page = 0; let fetchMore = true;
              while(fetchMore) { const { data } = await supabase.from('jobs').select('id, created_at, titulo, stage, prioridade, deadline, aprovado_cliente').range(page * 1000, (page + 1) * 1000 - 1); if (data && data.length > 0) { allJobs = [...allJobs, ...data]; page++; } else { fetchMore = false; } }
              dataToExport = allJobs.map(j => ({ ID_Job: j.id, Data_Criacao: j.created_at ? new Date(j.created_at).toLocaleDateString('pt-BR') : '', Titulo: j.titulo || '', Fase_Producao: j.stage || '', Prioridade: j.prioridade || '', Prazo_Entrega: j.deadline ? new Date(j.deadline).toLocaleDateString('pt-BR') : '', Aprovado: j.aprovado_cliente ? 'SIM' : 'NÃO' }));
          } else if (exportType === 'cidades') {
              dataToExport = mapaCidades.map((c: any) => ({ Regiao_Cidade: c.nome, Total_Vendas: c.count, Faturamento_Bruto: c.total.toFixed(2).replace('.', ','), Ticket_Medio: c.count > 0 ? (c.total / c.count).toFixed(2).replace('.', ',') : '0,00' }));
          }

          if (dataToExport.length === 0) { alert("Não há dados para exibir neste módulo e período selecionado."); setIsExporting(false); return; }
          setPreviewColumns(Object.keys(dataToExport[0])); setPreviewData(dataToExport);
      } catch (error) { console.error("Erro ao gerar visualização:", error); alert("Ocorreu um erro ao processar os dados."); } finally { setIsExporting(false); }
  };

  const handleDownloadCSV = () => {
      if (!previewData) return; const timestamp = new Date().toISOString().split('T')[0]; const filename = `extracao_${exportType}_${timestamp}.csv`; const csvContent = convertToCSV(previewData); downloadFile(csvContent, filename);
  };

  const closeModal = () => { setShowExportModal(false); setPreviewData(null); };

  let leadsParaFiltroVendedor = rawLeads;
  if (isGerente && perfil?.unidade) { leadsParaFiltroVendedor = rawLeads.filter(l => l.unidade === perfil.unidade); }
  const vendedoresDisponiveis = Array.from(new Set(leadsParaFiltroVendedor.map(l => l.vendedor_nome).filter(Boolean))) as string[];
  const unidadesDisponiveis = Array.from(new Set(rawLeads.map(l => l.unidade).filter(Boolean))) as string[];

  const getGrowth = (current: number, last: number) => { if (last === 0) return current > 0 ? 100 : 0; return ((current - last) / last) * 100; };

  if (loading && !rawLeads.length) return <div className="h-screen flex items-center justify-center bg-[#0B1120] text-blue-500 font-black animate-pulse">COMPILANDO DADOS DA SALA DE COMANDO...</div>;

  return (
    <div className="p-6 space-y-4 pb-20 animate-in fade-in duration-700">
      
      {/* 👇 HEADER SUPER COMPACTO: APENAS BOTÕES E FILTROS 👇 */}
      <div className="flex flex-col xl:flex-row justify-start items-start xl:items-center gap-2 mb-2 px-2">
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 w-full">
            
            {/* BOTÕES DE AÇÃO */}
            <div className="flex items-center gap-2 h-10">
                <button onClick={fetchReportData} className="bg-white/5 border border-white/10 text-slate-400 w-10 h-10 rounded-xl hover:text-white transition-all shadow-lg flex items-center justify-center flex-shrink-0" title="Atualizar Dados">
                  <Zap size={16}/>
                </button>
                <button onClick={() => setShowExportModal(true)} className="bg-purple-600/20 hover:bg-purple-600 border border-purple-500/30 text-purple-400 hover:text-white px-5 h-10 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_5px_20px_rgba(168,85,247,0.2)] transition-all whitespace-nowrap">
                  <Database size={14}/> Extrair Dados
                </button>
                <button onClick={() => window.print()} className="bg-white/5 border border-white/10 text-slate-400 hover:text-white px-4 h-10 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap print:hidden">
                  <Download size={14}/> PDF
                </button>
            </div>

            {/* ATALHOS DE PERÍODO */}
            <div className="hidden lg:flex items-center gap-1 h-10">
              {([
                { label: 'Hoje', fn: () => { const h = getLocalYYYYMMDD(new Date()); setDataInicio(h); setDataFim(h); } },
                { label: '7d', fn: () => { const fim = new Date(); const ini = new Date(); ini.setDate(fim.getDate()-6); setDataInicio(getLocalYYYYMMDD(ini)); setDataFim(getLocalYYYYMMDD(fim)); } },
                { label: 'Mês', fn: () => { const h = new Date(); setDataInicio(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth(), 1))); setDataFim(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth()+1, 0))); } },
                { label: 'Mês Ant.', fn: () => { const h = new Date(); setDataInicio(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth()-1, 1))); setDataFim(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth(), 0))); } },
                { label: 'Trim.', fn: () => { const h = new Date(); const t = Math.floor(h.getMonth()/3)*3; setDataInicio(getLocalYYYYMMDD(new Date(h.getFullYear(), t, 1))); setDataFim(getLocalYYYYMMDD(new Date(h.getFullYear(), t+3, 0))); } },
                { label: 'Sem.', fn: () => { const h = new Date(); const s = h.getMonth() < 6 ? 0 : 6; setDataInicio(getLocalYYYYMMDD(new Date(h.getFullYear(), s, 1))); setDataFim(getLocalYYYYMMDD(new Date(h.getFullYear(), s+6, 0))); } },
                { label: 'Ano', fn: () => { const h = new Date(); setDataInicio(`${h.getFullYear()}-01-01`); setDataFim(`${h.getFullYear()}-12-31`); } },
              ] as { label: string; fn: () => void }[]).map(p => (
                <button key={p.label} onClick={p.fn} className="px-2.5 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/5 whitespace-nowrap">
                  {p.label}
                </button>
              ))}
            </div>

            {/* BARRA DE FILTROS */}
            <div className="flex items-center bg-[#0F172A] border border-white/10 rounded-xl shadow-lg h-10 overflow-hidden flex-1 xl:flex-none">
                <Filter size={14} className="text-slate-400 ml-3 mr-2" />

                <div className="flex items-center gap-1 px-3 border-l border-white/10 h-full">
                    <input
                        type="date"
                        value={dataInicio}
                        onChange={e => setDataInicio(e.target.value)}
                        className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer"
                    />
                    <span className="text-slate-600 text-[9px] font-black">ATÉ</span>
                    <input
                        type="date"
                        value={dataFim}
                        onChange={e => setDataFim(e.target.value)}
                        className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer"
                    />
                </div>

                {isDirector && (
                    <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer appearance-none px-3 border-l border-white/10 h-full">
                        <option value="Todas" className="bg-[#0F172A]">Todas Unidades</option>
                        {unidadesDisponiveis.map(u => <option key={u} value={u} className="bg-[#0B1120]">{u}</option>)}
                    </select>
                )}

                {(isDirector || isGerente) && (
                    <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="bg-transparent border-none text-blue-400 text-[10px] font-black uppercase outline-none cursor-pointer appearance-none px-3 border-l border-white/10 h-full">
                        <option value="Todos" className="bg-[#0F172A]">Equipe Inteira</option>
                        {vendedoresDisponiveis.map(v => <option key={v} value={v} className="bg-[#0B1120]">{v}</option>)}
                    </select>
                )}
            </div>

            {(filtroVendedor !== 'Todos' || filtroUnidade !== 'Todas' || dataInicio !== getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) || dataFim !== getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))) && (
                <button onClick={() => { setFiltroVendedor('Todos'); setFiltroUnidade('Todas'); const hoje = new Date(); setDataInicio(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth(), 1))); setDataFim(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))); }} className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 rounded-xl transition-colors text-[10px] font-bold uppercase px-3 h-10 flex items-center justify-center gap-1 shadow-lg">
                    <X size={12}/> Limpar
                </button>
            )}
        </div>
      </div>

      {/* COMPARATIVOS KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
        {[
          { label: `Faturamento Selecionado`, current: currentMonth.faturamento, last: lastMonth.faturamento, prefix: 'R$ ', icon: TrendingUp, color: 'text-[#22C55E]' },
          { label: `Oportunidades (Vol)`, current: currentMonth.leads, last: lastMonth.leads, prefix: '', icon: Target, color: 'text-blue-500' },
          { label: `Ticket Médio`, current: currentMonth.ticket, last: lastMonth.ticket, prefix: 'R$ ', icon: Zap, color: 'text-purple-500' },
          { label: `Taxa de Conversão`, current: currentMonth.conversao, last: lastMonth.conversao, prefix: '', suffix: '%', icon: Clock, color: 'text-orange-500' },
        ].map((item, i) => {
          const growth = item.last !== undefined ? getGrowth(item.current, item.last) : null;
          
          return (
            <div key={i} className="bg-[#0B1120] border border-white/5 p-6 rounded-[32px] shadow-2xl relative overflow-hidden group hover:border-white/10 transition-all">
              <item.icon className={`absolute -right-4 -top-4 w-20 h-20 opacity-5 ${item.color}`} />
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{item.label}</p>
              <div className="flex items-end gap-2">
                <h3 className={`text-2xl font-black italic tracking-tighter ${item.color}`}>
                  {item.prefix}{(item.current || 0).toLocaleString('pt-BR', {minimumFractionDigits: item.prefix === 'R$ ' ? 2 : 0, maximumFractionDigits: item.prefix === 'R$ ' ? 2 : 0})}{item.suffix}
                </h3>
                {growth !== null && (
                   <div className={`flex items-center text-[10px] font-black px-1.5 py-0.5 rounded-lg mb-1 ${growth >= 0 ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-red-500/10 text-red-500'}`} title="Comparado ao período idêntico anterior">
                      {growth >= 0 ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}
                      {Math.abs(Math.round(growth))}%
                   </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* GRÁFICO DE BARRAS MENSAL */}
      {graficoMensal.some(m => m.valor > 0) && (
        <div className="bg-[#0B1120] border border-white/5 rounded-[32px] p-6 shadow-2xl">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-6">
            <BarChart3 size={18} className="text-orange-400" /> Evolução de Faturamento — Últimos 6 Meses
          </h3>
          <div className="flex items-end gap-3 h-40">
            {(() => {
              const maxVal = Math.max(...graficoMensal.map(m => m.valor), 1);
              return graficoMensal.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] font-black text-slate-500">
                    {m.valor > 0 ? `R$ ${(m.valor / 1000).toFixed(0)}k` : ''}
                  </span>
                  <div className="w-full flex items-end" style={{ height: '100px' }}>
                    <div
                      className={`w-full rounded-t-lg transition-all duration-700 ${m.isCurrent ? 'bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.4)]' : 'bg-white/10 hover:bg-white/20'}`}
                      style={{ height: `${Math.max((m.valor / maxVal) * 100, m.valor > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-black uppercase ${m.isCurrent ? 'text-orange-400' : 'text-slate-500'}`}>{m.label}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* FUNIL DE VISITAS */}
      {visitasFunil.total > 0 && (
        <div className="bg-[#0B1120] border border-white/5 rounded-[32px] p-6 shadow-2xl">
          <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-6">
            <MapPin size={18} className="text-blue-400" /> Funil de Visitas — Conversão em Lead e Venda
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* BARRAS DO FUNIL */}
            <div className="space-y-4">
              {[
                { label: 'Visitas Registradas', val: visitasFunil.total, color: 'bg-blue-500', pct: 100 },
                { label: 'Convertidas em Lead', val: visitasFunil.convertidas, color: 'bg-yellow-500', pct: visitasFunil.total > 0 ? Math.round((visitasFunil.convertidas / visitasFunil.total) * 100) : 0 },
                { label: 'Vendas Fechadas', val: visitasFunil.ganhas, color: 'bg-green-500', pct: visitasFunil.total > 0 ? Math.round((visitasFunil.ganhas / visitasFunil.total) * 100) : 0 },
              ].map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-black">{s.val}</span>
                      {i > 0 && <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${s.pct >= 30 ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{s.pct}%</span>}
                    </div>
                  </div>
                  <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {/* RANKING POR VENDEDOR */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Por Vendedor</p>
              <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                {visitasFunil.porVendedor.map((v: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2">
                    <span className="text-[9px] font-black text-slate-600 w-4">#{i+1}</span>
                    <span className="flex-1 text-xs font-bold text-white truncate">{v.nome}</span>
                    <div className="flex gap-3 text-[9px] font-black uppercase shrink-0">
                      <span className="text-blue-400">{v.total}v</span>
                      <span className="text-yellow-400">{v.convertidas}l</span>
                      <span className="text-green-400">{v.ganhas}$</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BLOCO 1: CURVA ABC + ELITE DE VENDAS */}
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
                      <p className="text-white font-black text-sm">R$ {valorNum.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
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
              const maxVendTotal = Number((rankingVendedores[0] as any)?.total) || 1;
              
              return (
                <div key={vend.nome || idx} className="flex items-center gap-4 group">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black italic shadow-lg flex-shrink-0 ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-slate-500 border border-white/10'}`}>
                    {idx + 1}º
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-white font-black text-xs uppercase group-hover:text-purple-400 transition-colors truncate pr-2">{vend.nome || 'Sem Nome'}</span>
                      <span className="text-[#22C55E] font-black text-[10px] whitespace-nowrap">R$ {vendTotal.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}</span>
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
        
        {/* TABELA DE ESTRATÉGIAS */}
        <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl flex flex-col">
          <div className="p-8 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
            <h3 className="text-white font-black uppercase italic flex items-center gap-2">
              <BarChart3 size={20} className="text-[#22C55E]" /> ROI de Estratégias (Premissas)
            </h3>
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
                {estrategiasImpacto.length > 0 ? estrategiasImpacto.map((est: any, i: number) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                          {est.titulo?.includes('Resgate') || est.titulo?.includes('Outras') ? <Sparkles size={14} className="text-purple-500"/> : <Crosshair size={14} className="text-blue-500"/>}
                          <span className="text-white font-bold text-sm uppercase italic group-hover:text-[#22C55E] transition-colors">{est.titulo}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-1 rounded-md font-black uppercase">{est.tipo || 'Vendas'}</span>
                    </td>
                    <td className="px-8 py-5 text-center text-white font-black">{est.gerados || 0}</td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex flex-col items-center">
                          <span className={`text-[10px] font-black uppercase ${(est.conversao || 0) >= 10 ? 'text-[#22C55E]' : 'text-slate-500'}`}>{Math.round(est.conversao || 0)}%</span>
                          <div className="w-12 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-[#22C55E]" style={{ width: `${est.conversao || 0}%` }} />
                          </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right text-[#22C55E] font-black italic">R$ {(est.faturamento || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
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
              const maxUndTotal = Number((performanceUnidades[0] as any)?.total) || 1;
              const share = currentMonth.faturamento > 0 ? Math.round((undTotal / currentMonth.faturamento) * 100) : 0;

              return (
                <div key={und.nome || idx}>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-white font-black text-xs uppercase truncate pr-2 max-w-[60%]">{und.nome}</span>
                    <span className="text-cyan-400 font-black text-[11px] whitespace-nowrap">R$ {undTotal.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}</span>
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

      {/* BLOCO 3: DESEMPENHO GEOGRÁFICO E DIAS DA SEMANA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* GEOGRÁFICO */}
          <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl flex flex-col">
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

            <div className="flex-1 overflow-y-auto max-h-[300px] custom-scrollbar pr-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {mapaCidades.length > 0 ? mapaCidades.map((cid: any, idx: number) => {
                        const cidTotal = Number(cid.total) || 0;
                        const maxCidTotal = Number((mapaCidades[0] as any)?.total) || 1;
                        const share = currentMonth.faturamento > 0 ? Math.round((cidTotal / currentMonth.faturamento) * 100) : 0;
                        
                        let heatColor = "bg-blue-500";
                        let textColor = "text-blue-400";
                        if (cid.nome === 'NÃO INFORMADA') { heatColor = "bg-red-500 opacity-50"; textColor = "text-red-400"; }
                        else if (idx === 0) { heatColor = "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"; textColor = "text-emerald-400"; }
                        else if (idx === 1 || idx === 2) { heatColor = "bg-orange-500"; textColor = "text-orange-400"; }

                        return (
                            <div key={cid.nome || idx} className="group">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-white font-black text-xs uppercase flex items-center gap-1 truncate pr-2" title={cid.nome}>
                                        <MapPin size={10} className={textColor} />
                                        {cid.nome}
                                    </span>
                                    <span className={`${textColor} font-black text-[11px] whitespace-nowrap`}>
                                        R$ {cidTotal.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}
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

          <div className="bg-[#0B1120] border border-white/5 rounded-[40px] p-8 shadow-2xl flex flex-col">
              <h3 className="text-white font-black uppercase italic flex items-center gap-2 mb-8">
                <CalendarDays size={20} className="text-amber-500" /> Pico por Dia da Semana
              </h3>
              <div className="space-y-6 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar pr-2">
                {vendasPorDia.length > 0 ? vendasPorDia.map((dia: any, idx: number) => {
                  const diaTotal = Number(dia.total) || 0;
                  const maxDiaTotal = Math.max(...vendasPorDia.map((d: any) => Number(d.total)), 1);
                  const share = currentMonth.faturamento > 0 ? Math.round((diaTotal / currentMonth.faturamento) * 100) : 0;

                  return (
                    <div key={dia.nome || idx}>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-white font-black text-xs uppercase truncate pr-2">{dia.nome}</span>
                        <span className="text-amber-500 font-black text-[11px] whitespace-nowrap">R$ {diaTotal.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}</span>
                      </div>
                      <ProgressBar value={diaTotal} max={maxDiaTotal} color="bg-amber-500" />
                      <div className="flex justify-between mt-1">
                          <p className="text-[9px] text-slate-500 font-bold uppercase">{dia.count} Fechamentos</p>
                          <p className="text-[9px] text-slate-400 font-black uppercase">Share: {share}%</p>
                      </div>
                    </div>
                  );
                }) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-50">
                        <CalendarDays size={32} className="mb-2" />
                        <p className="text-xs font-black uppercase">Sem dados diários</p>
                    </div>
                )}
              </div>
          </div>
      </div>

      {/* RELATÓRIO DE INADIMPLÊNCIA — só para quem tem módulo financeiro */}
      {mostrarFinanceiro && (
        <div className="bg-[#0B1120] border border-red-500/20 rounded-[32px] p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white font-black uppercase italic flex items-center gap-2">
              <AlertCircle size={18} className="text-red-400" /> Contratos Vencidos (Inadimplência)
              <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-lg font-black ml-1">{inadimplentes.length}</span>
            </h3>
            {inadimplentes.length > 0 && (
              <span className="text-[10px] text-slate-500 font-bold uppercase">
                Potencial de renovação: <span className="text-red-400 font-black">R$ {inadimplentes.reduce((s, i) => s + i.valor, 0).toLocaleString('pt-BR', {maximumFractionDigits: 0})}</span>
              </span>
            )}
          </div>

          {inadimplentes.length === 0 ? (
            <div className="text-center py-10 opacity-40">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
              <p className="text-xs font-black text-slate-500 uppercase">Nenhum contrato vencido no período filtrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-slate-500 tracking-widest bg-white/[0.02]">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Unidade</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3 text-center">Venceu em</th>
                    <th className="px-4 py-3 text-center">Dias Vencido</th>
                    <th className="px-4 py-3 text-right">Valor Contrato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {inadimplentes.slice(0, 20).map((item, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white text-xs font-bold uppercase truncate max-w-[200px]">{item.empresa}</td>
                      <td className="px-4 py-3 text-[10px] text-slate-400 font-bold uppercase">{item.unidade}</td>
                      <td className="px-4 py-3 text-[10px] text-blue-400 font-bold uppercase">{item.vendedor}</td>
                      <td className="px-4 py-3 text-center text-[10px] font-mono text-slate-400">{item.venceu.split('-').reverse().join('/')}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${item.diasVencido > 30 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                          {item.diasVencido}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black text-[#22C55E]">R$ {item.valor.toLocaleString('pt-BR', {maximumFractionDigits: 0})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inadimplentes.length > 20 && (
                <p className="text-[10px] text-slate-600 font-bold text-center py-3">+{inadimplentes.length - 20} contratos adicionais não exibidos</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL DE EXPORTAÇÃO DE DADOS & PREVIEW DA TABELA */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className={`bg-[#0B1120] border border-white/10 w-full transition-all duration-300 rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 ${previewData ? 'max-w-7xl h-[85vh]' : 'max-w-lg'}`}>
                
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02] flex-shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
                            <Database size={20} className="text-purple-500"/> {previewData ? 'Visualização da Tabela' : 'Central de Extração'}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                            {previewData ? `${previewData.length} registros encontrados (Período Filtrado)` : 'Extração com base nas datas e filtros selecionados na tela'}
                        </p>
                    </div>
                    <button onClick={closeModal} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={20}/>
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {!previewData ? (
                        <div className="p-8 space-y-6 overflow-y-auto">
                            <p className="text-xs text-slate-400 font-medium">Selecione o módulo que deseja visualizar. O sistema compilará a base de dados de acordo com os filtros de data e unidade que você aplicou na tela.</p>

                            <div className="grid grid-cols-1 gap-3">
                                <label className={`cursor-pointer flex items-center p-4 rounded-2xl border-2 transition-all ${exportType === 'leads' ? 'bg-blue-600/10 border-blue-500' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                                    <input type="radio" name="exportModule" value="leads" checked={exportType === 'leads'} onChange={(e) => setExportType(e.target.value)} className="hidden" />
                                    <Target size={24} className={exportType === 'leads' ? 'text-blue-500' : 'text-slate-500'} />
                                    <div className="ml-4">
                                        <h4 className={`font-black uppercase text-sm ${exportType === 'leads' ? 'text-white' : 'text-slate-300'}`}>1. Vendas (Oportunidades)</h4>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Tabela com funil de vendas, valores e responsáveis.</p>
                                    </div>
                                </label>

                                <label className={`cursor-pointer flex items-center p-4 rounded-2xl border-2 transition-all ${exportType === 'clientes' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                                    <input type="radio" name="exportModule" value="clientes" checked={exportType === 'clientes'} onChange={(e) => setExportType(e.target.value)} className="hidden" />
                                    <Users size={24} className={exportType === 'clientes' ? 'text-emerald-500' : 'text-slate-500'} />
                                    <div className="ml-4">
                                        <h4 className={`font-black uppercase text-sm ${exportType === 'clientes' ? 'text-white' : 'text-slate-300'}`}>2. Base de Clientes</h4>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Cadastro de clientes com CNPJ, contatos e cidades.</p>
                                    </div>
                                </label>

                                <label className={`cursor-pointer flex items-center p-4 rounded-2xl border-2 transition-all ${exportType === 'jobs' ? 'bg-orange-500/10 border-orange-500' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                                    <input type="radio" name="exportModule" value="jobs" checked={exportType === 'jobs'} onChange={(e) => setExportType(e.target.value)} className="hidden" />
                                    <Briefcase size={24} className={exportType === 'jobs' ? 'text-orange-500' : 'text-slate-500'} />
                                    <div className="ml-4">
                                        <h4 className={`font-black uppercase text-sm ${exportType === 'jobs' ? 'text-white' : 'text-slate-300'}`}>3. Produção (Jobs)</h4>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Andamento dos projetos, prazos e prioridades.</p>
                                    </div>
                                </label>

                                <label className={`cursor-pointer flex items-center p-4 rounded-2xl border-2 transition-all ${exportType === 'cidades' ? 'bg-indigo-500/10 border-indigo-500' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                                    <input type="radio" name="exportModule" value="cidades" checked={exportType === 'cidades'} onChange={(e) => setExportType(e.target.value)} className="hidden" />
                                    <MapPin size={24} className={exportType === 'cidades' ? 'text-indigo-500' : 'text-slate-500'} />
                                    <div className="ml-4">
                                        <h4 className={`font-black uppercase text-sm ${exportType === 'cidades' ? 'text-white' : 'text-slate-300'}`}>4. Desempenho Geográfico</h4>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Faturamento e volume de vendas consolidados por cidade.</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-[#0B1120]">
                            <div className="border border-white/10 rounded-2xl overflow-hidden shadow-inner">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-[#0F172A] z-10 shadow-md">
                                        <tr>
                                            {previewColumns.map((col, idx) => (
                                                <th key={idx} className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-white/5 whitespace-nowrap">
                                                    {col.replace(/_/g, ' ')}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {previewData.map((row, rIdx) => (
                                            <tr key={rIdx} className="hover:bg-white/[0.02] transition-colors">
                                                {previewColumns.map((col, cIdx) => (
                                                    <td key={cIdx} className="px-6 py-4 text-xs text-slate-300 whitespace-nowrap">
                                                        {row[col] || '-'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/10 bg-[#0F172A] flex-shrink-0">
                    {!previewData ? (
                        <button 
                            onClick={handleGeneratePreview} 
                            disabled={isExporting}
                            className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all ${isExporting ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]'}`}
                        >
                            {isExporting ? (
                                <><Zap size={16} className="animate-spin"/> COMPILANDO BASE...</>
                            ) : (
                                <><Eye size={16}/> GERAR VISUALIZAÇÃO</>
                            )}
                        </button>
                    ) : (
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setPreviewData(null)} 
                                className="px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 transition-all bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                            >
                                <ArrowLeft size={16}/> VOLTAR
                            </button>
                            <button 
                                onClick={handleDownloadCSV} 
                                className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                            >
                                <FileSpreadsheet size={16}/> CONFIRMAR E BAIXAR .CSV
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
      )}

    </div>
  );
}