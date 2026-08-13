"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, Users, DollarSign,
  BarChart3, Calendar, Loader2,
  CheckCircle2, MapPin, FileText, Target, Filter, X, AlertCircle, Building2, CalendarDays, RefreshCw, Bell, Tag, Megaphone
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { InfoTooltip } from '@/components/InfoTooltip';
import { SkeletonDashboard } from '@/components/Skeleton';

type RankingItem = { id: string; nome: string; total: number; count: number; vendas: number; visitas: number; };

const getLocalYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export default function DashboardPage() {
  const router = useRouter();
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isCDL = Boolean(empresa?.modulos?.cdl);

  // Dashboard é o destino padrão pós-login, mas é uma página do macro CRM — empresa
  // com CRM desligado (ex: só usa Nexus) não pode cair aqui, senão vê a tela cheia de
  // pipeline mesmo sem esse módulo ativo. Manda pro primeiro lugar que ela realmente tem.
  useEffect(() => {
    if ((auth as any).loading || !empresa) return;
    const mostrarCRM = empresa?.modulos?.crm !== false;
    if (mostrarCRM) return;
    if (empresa?.modulos?.nexus) { router.replace('/nexus'); return; }
    router.replace('/customers');
  }, [(auth as any).loading, empresa, router]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // Status para o refresh automático
  const [visao, setVisao] = useState<'comercial' | 'diretoria'>('comercial'); 
  
  const [dataInicio, setDataInicio] = useState(() => {
      const hoje = new Date();
      const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return getLocalYYYYMMDD(primeiroDia);
  });
  
  const [dataFim, setDataFim] = useState(() => {
      const hoje = new Date();
      const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      return getLocalYYYYMMDD(ultimoDia);
  });

  const [filtroUnidade, setFiltroUnidade] = useState<string>('Todas');
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string | null>(null);

  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [rawPerfis, setRawPerfis] = useState<any[]>([]);
  const [rawJobs, setRawJobs] = useState<any[]>([]);
  const [rawLancamentos, setRawLancamentos] = useState<any[]>([]);
  const [rawVisitas, setRawVisitas] = useState<any[]>([]);

  const isDirector = perfil?.cargo === 'diretor';
  const temMidia = Boolean(empresa?.modulos?.midia);

  // 👇 FUNÇÃO DE CARREGAMENTO BLINDADA 👇
  const carregarDadosOtimizado = useCallback(async (isAutoRefresh = false) => {
    if (!isAutoRefresh) setLoading(true);
    else setRefreshing(true);

    try {
        let leadsQuery = supabase
          .from('leads')
          .select('id, user_id, vendedor_nome, unidade, status, created_at, valor_total, desconto, checkin, etapa, tipo, contrato_fim, empresa, followup_em');

        if (perfil?.empresa_id) leadsQuery = leadsQuery.eq('empresa_id', perfil.empresa_id);
        if (!isDirector) {
            leadsQuery = leadsQuery.eq('user_id', user?.id);
        }

        let perfisQuery = supabase.from('profiles').select('id, nome');
        if (perfil?.empresa_id) perfisQuery = perfisQuery.eq('empresa_id', perfil.empresa_id) as any;

        let jobsQuery = supabase.from('jobs').select('stage, deadline');
        if (perfil?.empresa_id) jobsQuery = jobsQuery.eq('empresa_id', perfil.empresa_id) as any;

        let visitasQuery = supabase.from('visitas').select('id, user_id, unidade, created_at, lead_id');
        if (perfil?.empresa_id) visitasQuery = visitasQuery.eq('empresa_id', perfil.empresa_id) as any;
        if (!isDirector) visitasQuery = visitasQuery.eq('user_id', user?.id) as any;

        const [leadsRes, perfisRes, jobsRes, finRes, visitasRes] = await Promise.all([
            leadsQuery,
            perfisQuery,
            jobsQuery,
            supabase.from('lancamentos').select('valor, tipo').eq('status', 'pago'),
            visitasQuery,
        ]);

        setRawLeads(leadsRes.data || []);
        setRawPerfis(perfisRes.data || []);
        setRawJobs(jobsRes.data || []);
        setRawLancamentos(finRes.data || []);
        setRawVisitas(visitasRes.data || []);

    } catch (error) {
        console.error("Erro no refresh do dashboard:", error);
    } finally {
        setLoading(false);
        setRefreshing(false);
    }
  }, [isDirector, user?.id, perfil?.empresa_id]);

  // 👇 O CORAÇÃO DO MODO TV (AUTO-REFRESH 5 MINUTOS) 👇
  useEffect(() => {
    if (user) {
      carregarDadosOtimizado();
      
      const interval = setInterval(() => {
        carregarDadosOtimizado(true);
      }, 300000);

      return () => clearInterval(interval);
    }
  }, [user, carregarDadosOtimizado]);

  const unidadesDisponiveis = useMemo(() => Array.from(new Set(rawLeads.map(l => l.unidade).filter(Boolean))) as string[], [rawLeads]);
  const vendedoresDisponiveis = useMemo(() => rawPerfis.filter((p: any) => p.nome).sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR')), [rawPerfis]);

  const { ranking, statsComercial, previsaoFechamento, contratosVencendo, followupsHoje, followupsAtrasados } = useMemo(() => {
      const nomesMap = rawPerfis.reduce((acc: any, p) => ({ ...acc, [p.id]: p.nome }), {});
      const leadsFiltrados = rawLeads.filter(lead => {
          if (filtroUnidade !== 'Todas' && lead.unidade !== filtroUnidade) return false;
          if (vendedorSelecionado && vendedorSelecionado !== 'Todos') {
              if (lead.user_id !== vendedorSelecionado && lead.vendedor_nome !== nomesMap[vendedorSelecionado]) return false;
          }
          const dataLead = lead.created_at.substring(0, 10); 
          if (dataInicio && dataLead < dataInicio) return false;
          if (dataFim && dataLead > dataFim) return false;
          return true;
      });

      const rankObj = leadsFiltrados.reduce((acc: any, lead) => {
         const chave = lead.user_id || 'sem_dono';
         const nomeVendedor = lead.vendedor_nome || nomesMap[lead.user_id] || 'Desconhecido';
         if (!acc[chave]) acc[chave] = { id: chave, nome: nomeVendedor, total: 0, count: 0, vendas: 0 };
         if (lead.status === 'ganho') { acc[chave].total += (Number(lead.valor_total) || 0); acc[chave].vendas += 1; }
         acc[chave].count += 1;
         return acc;
      }, {});
      
      const rankingFinal = Object.values(rankObj).sort((a: any, b: any) => b.total - a.total) as RankingItem[];

      let fat = 0; let ganhos = 0; let perdidos = 0; let comVisita = 0;
      let totalDesconto = 0;
      const funil = { novos: 0, contato: 0, proposta: 0, negociacao: 0, ganho: 0, perdido: 0 };

      leadsFiltrados.forEach(l => {
          const st = l.status; const et = Number(l.etapa);
          const hasCheckin = l.checkin && l.checkin.length > 5;
          if (hasCheckin) { comVisita++; }
          if (st === 'ganho') { fat += (Number(l.valor_total) || 0); ganhos++; funil.ganho++; totalDesconto += (Number(l.desconto) || 0); }
          else if (st === 'perdido') { perdidos++; funil.perdido++; }
          else { if (et === 0) funil.novos++; if (et === 1) funil.contato++; if (et === 2) funil.proposta++; if (et >= 3) funil.negociacao++; }
      });

      // Visitas reais (tabela visitas — mesma fonte do painel /visitas), respeitando os filtros ativos
      const visitasFiltradas = rawVisitas.filter((v: any) => {
          if (filtroUnidade !== 'Todas' && v.unidade !== filtroUnidade) return false;
          if (vendedorSelecionado && vendedorSelecionado !== 'Todos' && v.user_id !== vendedorSelecionado) return false;
          const dataVisita = v.created_at.substring(0, 10);
          if (dataInicio && dataVisita < dataInicio) return false;
          if (dataFim && dataVisita > dataFim) return false;
          return true;
      });
      const visitasPorVendedor: Record<string, number> = {};
      visitasFiltradas.forEach((v: any) => { const k = v.user_id || 'sem_dono'; visitasPorVendedor[k] = (visitasPorVendedor[k] || 0) + 1; });
      rankingFinal.forEach((r: any) => { r.visitas = visitasPorVendedor[r.id] || 0; });

      const leadsPorId = new Map(rawLeads.map((l: any) => [l.id, l]));
      const visitasRegistradas = visitasFiltradas.length;
      const visitasConvertidas = visitasFiltradas.filter((v: any) => v.lead_id).length;
      const visitasGanhas = visitasFiltradas.filter((v: any) => v.lead_id && leadsPorId.get(v.lead_id)?.status === 'ganho').length;

      // Conversão = leads ganhos sobre total de visitas registradas (não sobre total de leads do funil)
      const conversao = visitasRegistradas > 0 ? (ganhos / visitasRegistradas) * 100 : 0;
      const semVisita = leadsFiltrados.length - comVisita;

      // Período anterior para comparativo (mesmo comprimento, imediatamente antes).
      // Usa o fim efetivo (hoje, se o período selecionado ainda não acabou) pra não comparar
      // poucos dias reais do período atual contra o mês anterior inteiro.
      const hojeStr = getLocalYYYYMMDD(new Date());
      const dataFimEfetiva = dataFim && dataFim > hojeStr ? hojeStr : dataFim;
      const periodoDias = dataInicio && dataFimEfetiva
        ? Math.ceil((new Date(dataFimEfetiva + 'T12:00:00').getTime() - new Date(dataInicio + 'T12:00:00').getTime()) / 86400000) + 1
        : 30;
      const fimAnt = dataInicio ? new Date(new Date(dataInicio + 'T12:00:00').getTime() - 86400000) : new Date();
      const iniAnt = new Date(fimAnt.getTime() - (periodoDias - 1) * 86400000);
      const iniAntStr = getLocalYYYYMMDD(iniAnt);
      const fimAntStr = getLocalYYYYMMDD(fimAnt);
      const leadsAnt = rawLeads.filter(l => {
        const d = l.created_at.substring(0, 10);
        if (filtroUnidade !== 'Todas' && l.unidade !== filtroUnidade) return false;
        if (vendedorSelecionado && vendedorSelecionado !== 'Todos' && l.user_id !== vendedorSelecionado && l.vendedor_nome !== nomesMap[vendedorSelecionado]) return false;
        return d >= iniAntStr && d <= fimAntStr;
      });
      const visitasAnt = rawVisitas.filter((v: any) => {
        const d = v.created_at.substring(0, 10);
        if (filtroUnidade !== 'Todas' && v.unidade !== filtroUnidade) return false;
        if (vendedorSelecionado && vendedorSelecionado !== 'Todos' && v.user_id !== vendedorSelecionado) return false;
        return d >= iniAntStr && d <= fimAntStr;
      });
      const fatAnt = leadsAnt.filter(l => l.status === 'ganho').reduce((acc, l) => acc + (Number(l.valor_total) || 0), 0);
      const gAnt = leadsAnt.filter(l => l.status === 'ganho').length;
      const convAnt = visitasAnt.length > 0 ? (gAnt / visitasAnt.length) * 100 : 0;
      const deltaFat = fatAnt > 0 ? ((fat - fatAnt) / fatAnt) * 100 : null;
      const deltaConv = convAnt > 0 ? Math.round(conversao - convAnt) : null;

      // Evolução do ano corrente, mês a mês (independente de filtros)
      const refMes = new Date();
      const evolucaoMensal = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(refMes.getFullYear(), i, 1);
        const ini = getLocalYYYYMMDD(d);
        const fim2 = getLocalYYYYMMDD(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
        const valor = rawLeads
          .filter(l => l.status === 'ganho' && l.created_at.substring(0, 10) >= ini && l.created_at.substring(0, 10) <= fim2)
          .reduce((acc, l) => acc + (Number(l.valor_total) || 0), 0);
        return { label, valor, isCurrent: i === refMes.getMonth() };
      });

      // Vendas por Dia: quando o filtro é um único dia (ex: clicou numa barra), uma faixa
      // real de 1 dia vira 1 barra gigante — feio. Nesse caso mostra o mês inteiro do dia
      // selecionado (com dados reais de cada dia, sem restringir por data), só destacando o
      // dia escolhido — mesmo princípio da Evolução Mensal, que também nunca encolhe.
      const vendasPorDiaArray: { dia: string, valor: number, dataIso: string }[] = [];
      const diaUnicoSelecionado = Boolean(dataInicio && dataFim && dataInicio === dataFim);
      if (diaUnicoSelecionado) {
          const base = new Date(dataInicio + 'T12:00:00');
          const inicioMes = new Date(base.getFullYear(), base.getMonth(), 1);
          const diasNoMes = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
          for (let i = 0; i < diasNoMes; i++) {
              const curr = new Date(inicioMes); curr.setDate(inicioMes.getDate() + i);
              const iso = getLocalYYYYMMDD(curr); const label = `${String(curr.getDate()).padStart(2,'0')}/${String(curr.getMonth()+1).padStart(2,'0')}`;
              vendasPorDiaArray.push({ dia: label, valor: 0, dataIso: iso });
          }
      } else if (dataInicio && dataFim) {
          const start = new Date(dataInicio + 'T12:00:00'); const end = new Date(dataFim + 'T12:00:00');
          const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
          const maxDays = Math.min(diffDays, 60);
          for (let i = 0; i <= maxDays; i++) {
              const curr = new Date(start); curr.setDate(start.getDate() + i);
              const iso = getLocalYYYYMMDD(curr); const label = `${String(curr.getDate()).padStart(2,'0')}/${String(curr.getMonth()+1).padStart(2,'0')}`;
              vendasPorDiaArray.push({ dia: label, valor: 0, dataIso: iso });
          }
      }

      // No mês inteiro (dia único selecionado) usa leads sem o recorte estreito de data —
      // senão só o dia clicado teria valor e o resto do mês ficaria zerado sem necessidade.
      const leadsParaVendasPorDia = diaUnicoSelecionado
        ? rawLeads.filter(l => {
            if (filtroUnidade !== 'Todas' && l.unidade !== filtroUnidade) return false;
            if (vendedorSelecionado && vendedorSelecionado !== 'Todos' && l.user_id !== vendedorSelecionado && l.vendedor_nome !== nomesMap[vendedorSelecionado]) return false;
            return true;
          })
        : leadsFiltrados;
      leadsParaVendasPorDia.forEach(l => { if (l.status === 'ganho') { const leadData = l.created_at.substring(0, 10); const slot = vendasPorDiaArray.find(v => v.dataIso === leadData); if (slot) slot.valor += (Number(l.valor_total) || 0); } });
      const prod = { roteiro: 0, gravacao: 0, edicao: 0, opec: 0 };
      rawJobs.forEach((j: any) => { if (j.stage === 'roteiro') prod.roteiro++; if (j.stage === 'gravacao') prod.gravacao++; if (j.stage === 'edicao') prod.edicao++; if (j.stage === 'opec') prod.opec++; });
      const ent = rawLancamentos.filter(l => l.tipo === 'entrada').reduce((acc, l) => acc + l.valor, 0);
      const sai = rawLancamentos.filter(l => l.tipo === 'saida').reduce((acc, l) => acc + l.valor, 0);

      // Previsão de fechamento = já ganho no período (fat, 100%) + pipeline ainda aberto,
      // ponderado pela probabilidade da etapa. O pipeline aberto não é filtrado por data
      // (leads abertos não têm "período de fechamento" ainda), mas respeita unidade/vendedor
      // selecionados, senão o número não bate com o resto do dashboard.
      const probEtapa: Record<number, number> = { 0: 0.10, 1: 0.25, 2: 0.45, 3: 0.70 };
      const previsaoFechamento = fat + rawLeads
          .filter(l => {
              if (l.status !== 'aberto') return false;
              if (filtroUnidade !== 'Todas' && l.unidade !== filtroUnidade) return false;
              if (vendedorSelecionado && vendedorSelecionado !== 'Todos' && l.user_id !== vendedorSelecionado && l.vendedor_nome !== nomesMap[vendedorSelecionado]) return false;
              return true;
          })
          .reduce((acc, l) => acc + (Number(l.valor_total) || 0) * (probEtapa[Number(l.etapa)] || 0.10), 0);

      // Contratos vencendo em 30 dias (leads ganhos com contrato_fim próximo)
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30);
      const contratosVencendo = rawLeads
          .filter(l => {
              if (l.status !== 'ganho' || !l.contrato_fim) return false;
              const fim = new Date((l.contrato_fim as string) + 'T00:00:00');
              return fim >= hoje && fim <= em30;
          })
          .sort((a: any, b: any) => new Date(a.contrato_fim + 'T00:00:00').getTime() - new Date(b.contrato_fim + 'T00:00:00').getTime());

      return {
          ranking: rankingFinal,
          statsComercial: { faturamentoMês: fat, metaMes: 100000, leadsAbertos: leadsFiltrados.length - ganhos - perdidos, totalVisitas: visitasRegistradas, taxaConversao: Math.round(conversao), propostasEnviadas: leadsFiltrados.length, leadsSemVisita: semVisita, leadsComVisita: comVisita, funil, vendasPorDia: vendasPorDiaArray, visitasRegistradas, visitasConvertidas, visitasGanhas, deltaFat, deltaConv, evolucaoMensal, totalDesconto },
          statsProducao: prod,
          statsFinanceiro: { saldo: ent - sai, entradas: ent, saidas: sai },
          previsaoFechamento: Math.round(previsaoFechamento),
          contratosVencendo,
          followupsHoje: rawLeads.filter(l => l.followup_em === getLocalYYYYMMDD(new Date()) && l.status !== 'ganho' && l.status !== 'perdido'),
          followupsAtrasados: rawLeads.filter(l => l.followup_em && l.followup_em < getLocalYYYYMMDD(new Date()) && l.status !== 'ganho' && l.status !== 'perdido'),
      };
  }, [rawLeads, rawPerfis, rawJobs, rawLancamentos, rawVisitas, vendedorSelecionado, dataInicio, dataFim, filtroUnidade]);

  useEffect(() => {
    if (!contratosVencendo.length || !user?.id) return;
    const hoje = getLocalYYYYMMDD(new Date());
    const storageKey = `nr_${hoje}_${user.id}`;
    const jaEnviados: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const novos = contratosVencendo.filter((l: any) => !jaEnviados.includes(String(l.id)));
    if (!novos.length) return;
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const registros = novos.map((l: any) => {
      const fim = new Date(l.contrato_fim + 'T00:00:00');
      const dias = Math.round((fim.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
      return {
        user_id: user.id,
        titulo: `⚠️ Renovação: ${l.empresa}`,
        mensagem: `Contrato vence em ${dias} dia${dias !== 1 ? 's' : ''}. Entre em contato para renovar.`,
        lida: false,
      };
    });
    supabase.from('notifications').insert(registros).then(({ error }) => {
      if (!error) localStorage.setItem(storageKey, JSON.stringify([...jaEnviados, ...novos.map((l: any) => String(l.id))]));
    });
  }, [contratosVencendo, user?.id]);

  const handleSellerClick = (id: string) => setVendedorSelecionado(prev => prev === id ? null : id);
  const getDonutGradient = (visitados: number, pendentes: number) => { const total = visitados + pendentes; if (total === 0) return `conic-gradient(#334155 100%, #334155 100%)`; const pct = (visitados / total) * 100; return `conic-gradient(#22C55E ${pct}%, #EF4444 0)`; };
  const formatCompact = (num: number) => { if(num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'k'; return num % 1 === 0 ? num.toString() : num.toFixed(2); };

  // Drill-down: leva os filtros atuais do dashboard (vendedor/unidade/período) pra tela de
  // destino, já filtrada — clicar num KPI/gráfico/lista aqui abre a lista real de lá.
  const irParaDeals = (extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams();
    if (vendedorSelecionado) qs.set('vendedor', vendedorSelecionado);
    if (filtroUnidade !== 'Todas') qs.set('unidade', filtroUnidade);
    if (dataInicio) qs.set('dataInicio', dataInicio);
    if (dataFim) qs.set('dataFim', dataFim);
    Object.entries(extra).forEach(([k, v]) => qs.set(k, v));
    router.push(`/deals?${qs.toString()}`);
  };

  const irParaVisitas = (extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams();
    if (vendedorSelecionado) qs.set('vendedor', vendedorSelecionado);
    if (dataInicio) qs.set('dataInicio', dataInicio);
    if (dataFim) qs.set('dataFim', dataFim);
    Object.entries(extra).forEach(([k, v]) => qs.set(k, v));
    router.push(`/visitas?${qs.toString()}`);
  };

  // Clicar num dia/mês do gráfico estreita o período do próprio dashboard (mesmo padrão do
  // ranking, que já isola vendedor ao clicar) — clicar de novo no mesmo período volta ao mês cheio.
  const filtrarPorPeriodo = (ini: string, fim: string) => {
    const hoje = new Date();
    if (dataInicio === ini && dataFim === fim) {
      setDataInicio(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
      setDataFim(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)));
    } else {
      setDataInicio(ini);
      setDataFim(fim);
    }
  };

  if (loading && !rawLeads.length) return <SkeletonDashboard />;

  return (
    <main className="space-y-4 pb-4 animate-in fade-in duration-500">

      {followupsAtrasados.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <Bell size={16} className="text-red-400 shrink-0 animate-pulse"/>
          <p className="text-red-300 text-xs font-black uppercase tracking-wide flex-1">
            {followupsAtrasados.length} follow-up{followupsAtrasados.length > 1 ? 's' : ''} atrasado{followupsAtrasados.length > 1 ? 's' : ''}:
            <span className="text-white ml-2">{followupsAtrasados.slice(0, 3).map((l: any) => l.empresa).join(' · ')}{followupsAtrasados.length > 3 ? ` +${followupsAtrasados.length - 3}` : ''}</span>
          </p>
          <a href="/deals" className="text-[9px] font-black uppercase text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors shrink-0">Ver no Funil →</a>
        </div>
      )}

      {followupsHoje.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <Bell size={16} className="text-blue-400 shrink-0 animate-pulse"/>
          <p className="text-blue-300 text-xs font-black uppercase tracking-wide flex-1">
            {followupsHoje.length} follow-up{followupsHoje.length > 1 ? 's' : ''} para hoje:
            <span className="text-white ml-2">{followupsHoje.slice(0, 3).map((l: any) => l.empresa).join(' · ')}{followupsHoje.length > 3 ? ` +${followupsHoje.length - 3}` : ''}</span>
          </p>
          <a href="/deals" className="text-[9px] font-black uppercase text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors shrink-0">Ver no Funil →</a>
        </div>
      )}

      <div className="flex flex-col xl:flex-row justify-end items-start xl:items-center gap-4 mb-2 px-2">
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 w-full">
            <div className="bg-[#0F172A] border border-white/10 p-1 rounded-xl flex gap-1 h-10 shadow-lg items-center">
                {/* 👇 INDICADOR DE ATUALIZAÇÃO MODO TV 👇 */}
                <div className={`px-2 transition-all ${refreshing ? 'opacity-100 scale-110' : 'opacity-30 scale-100'}`}>
                    <RefreshCw size={12} className={`text-[#22C55E] ${refreshing ? 'animate-spin' : ''}`} />
                </div>
                <button onClick={() => setVisao('comercial')} className={`flex items-center justify-center gap-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all h-full ${visao === 'comercial' ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                    <TrendingUp size={12}/> {isCDL ? 'Captação' : 'Comercial'}
                </button>
            </div>

            {isDirector && temMidia && (
              <a href="/midia" className="flex items-center justify-center gap-2 px-3 h-10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[#0F172A] border border-white/10 text-pink-400 hover:bg-pink-500 hover:text-white hover:border-pink-500 shadow-lg">
                <Megaphone size={12}/> Mídia
              </a>
            )}
            
            <div className="hidden lg:flex items-center gap-1 h-10">
              {([
                { label: 'Hoje', fn: () => { const h = getLocalYYYYMMDD(new Date()); setDataInicio(h); setDataFim(h); } },
                { label: '7d', fn: () => { const fim = new Date(); const ini = new Date(); ini.setDate(fim.getDate()-6); setDataInicio(getLocalYYYYMMDD(ini)); setDataFim(getLocalYYYYMMDD(fim)); } },
                { label: 'Mês', fn: () => { const h = new Date(); setDataInicio(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth(), 1))); setDataFim(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth()+1, 0))); } },
                { label: 'Mês Ant.', fn: () => { const h = new Date(); setDataInicio(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth()-1, 1))); setDataFim(getLocalYYYYMMDD(new Date(h.getFullYear(), h.getMonth(), 0))); } },
                { label: 'Trim.', fn: () => { const h = new Date(); const t = Math.floor(h.getMonth()/3)*3; setDataInicio(getLocalYYYYMMDD(new Date(h.getFullYear(), t, 1))); setDataFim(getLocalYYYYMMDD(new Date(h.getFullYear(), t+3, 0))); } },
              ] as { label: string; fn: () => void }[]).map(p => (
                <button key={p.label} onClick={p.fn} className="px-2.5 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/5 whitespace-nowrap">
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-[#0F172A] border border-white/10 rounded-xl shadow-lg h-10 overflow-hidden flex-1 xl:flex-none">
                <Filter size={14} className="text-slate-400 ml-3 mr-2" />
                <div className="flex items-center gap-1 px-3 border-l border-white/10 h-full">
                    <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer" />
                    <span className="text-slate-600 text-[9px] font-black">ATÉ</span>
                    <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer" />
                </div>
                <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer appearance-none px-3 border-l border-white/10 h-full">
                    <option value="Todas" className="bg-[#0F172A]">Todas Unidades</option>
                    {unidadesDisponiveis.map(u => <option key={u} value={u} className="bg-[#0B1120]">{u}</option>)}
                </select>
                {isDirector && (
                    <select value={vendedorSelecionado || 'Todos'} onChange={e => setVendedorSelecionado(e.target.value === 'Todos' ? null : e.target.value)} className="bg-transparent border-none text-orange-500 text-[10px] font-black uppercase outline-none cursor-pointer appearance-none px-3 border-l border-white/10 h-full">
                        <option value="Todos" className="bg-[#0F172A]">Toda Equipe</option>
                        {vendedoresDisponiveis.map((v: any) => <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>)}
                    </select>
                )}
            </div>

            {(vendedorSelecionado !== null || filtroUnidade !== 'Todas' || dataInicio !== getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) || dataFim !== getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))) && (
              <button onClick={() => { setVendedorSelecionado(null); setFiltroUnidade('Todas'); const hoje = new Date(); setDataInicio(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth(), 1))); setDataFim(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))); }} className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 rounded-xl transition-colors text-[10px] font-bold uppercase px-3 h-10 flex items-center justify-center gap-1 shadow-lg">
                  <X size={12}/> Limpar
              </button>
            )}
        </div>
      </div>

      {visao === 'comercial' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div onClick={() => irParaDeals({ etapa: '4' })} className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg cursor-pointer hover:border-orange-500/40 transition-colors">
                    <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-0.5 flex justify-between">{isCDL ? 'Receita de Anuidades' : 'Faturamento'} {filtroUnidade !== 'Todas' && <Building2 size={10} className="text-white/20"/>}</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">R$ {statsComercial.faturamentoMês.toLocaleString('pt-BR', { notation: "compact", maximumFractionDigits: 1 })}</h3>
                    {statsComercial.deltaFat !== null && (
                      <p className={`text-[9px] font-black mt-1 ${statsComercial.deltaFat >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {statsComercial.deltaFat >= 0 ? '▲' : '▼'} {Math.abs(statsComercial.deltaFat).toFixed(1)}% vs período anterior
                      </p>
                    )}
                    <TrendingUp className="absolute top-4 right-4 text-orange-500 opacity-20" size={24} />
                </div>
                <div onClick={() => irParaDeals({ etapa: '4' })} className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg cursor-pointer hover:border-blue-500/40 transition-colors">
                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5 flex items-center">
                      {isCDL ? 'Taxa de Filiação' : 'Conversão'}
                      <span onClick={e => e.stopPropagation()}>
                        <InfoTooltip texto="Leads ganhos ÷ visitas registradas × 100 (não sobre o total de leads do funil). Por isso pode diferir da Taxa de Conversão do Relatórios, que usa leads ganhos ÷ total de leads criados no período." />
                      </span>
                    </p>
                    <h3 className="text-2xl font-black text-white tracking-tight">{statsComercial.taxaConversao}%</h3>
                    {statsComercial.deltaConv !== null && (
                      <p className={`text-[9px] font-black mt-1 ${statsComercial.deltaConv >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {statsComercial.deltaConv >= 0 ? '▲' : '▼'} {Math.abs(statsComercial.deltaConv)}pp vs período anterior
                      </p>
                    )}
                    <CheckCircle2 className="absolute top-4 right-4 text-blue-400 opacity-20" size={24} />
                </div>
                <div onClick={() => irParaVisitas()} className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg cursor-pointer hover:border-yellow-500/40 transition-colors">
                    <p className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-0.5">Visitas</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">{statsComercial.totalVisitas}</h3>
                    <MapPin className="absolute top-4 right-4 text-yellow-400 opacity-20" size={24} />
                </div>
                <div onClick={() => irParaDeals()} className="bg-[#0B1120] border border-white/10 p-4 rounded-2xl relative overflow-hidden group shadow-lg cursor-pointer hover:border-purple-500/40 transition-colors">
                    <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-0.5">{isCDL ? 'Prospectos' : 'Leads Totais'}</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">{statsComercial.propostasEnviadas}</h3>
                    <FileText className="absolute top-4 right-4 text-purple-400 opacity-20" size={24} />
                </div>
                <div onClick={() => irParaDeals({ etapa: '4' })} className="bg-[#0B1120] border border-red-500/20 p-4 rounded-2xl relative overflow-hidden group shadow-lg cursor-pointer hover:border-red-500/50 transition-colors">
                    <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-0.5">Descontos Dados</p>
                    <h3 className="text-2xl font-black text-white tracking-tight">
                        {statsComercial.totalDesconto > 0
                            ? `R$ ${statsComercial.totalDesconto.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}`
                            : '—'}
                    </h3>
                    {statsComercial.totalDesconto > 0 && statsComercial.faturamentoMês > 0 && (
                        <p className="text-[9px] font-black text-red-400 mt-1">
                            {((statsComercial.totalDesconto / (statsComercial.faturamentoMês + statsComercial.totalDesconto)) * 100).toFixed(1)}% do bruto
                        </p>
                    )}
                    <Tag className="absolute top-4 right-4 text-red-400 opacity-20" size={24} />
                </div>
            </div>

            {statsComercial.propostasEnviadas === 0 && (
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-center gap-3 text-slate-400">
                    <AlertCircle size={16} />
                    <span className="text-xs font-bold uppercase">Sem dados comerciais para este filtro.</span>
                </div>
            )}

            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4">
                    <BarChart3 size={14} className="text-orange-500"/> {isCDL ? 'Filiações por Dia' : 'Vendas por Dia'}
                </h3>
                <div className="flex items-end h-40 gap-1 overflow-x-auto pb-1 custom-scrollbar w-full pt-4">
                    {(() => {
                        const hojeIso = new Date().toISOString().substring(0, 10);
                        const maxVal = Math.max(...statsComercial.vendasPorDia.map(v => v.valor), 1);
                        return statsComercial.vendasPorDia.map((d, i) => {
                            const height = d.valor > 0 ? Math.max((d.valor / maxVal) * 100, 5) : 0;
                            const isHoje = d.dataIso === hojeIso;
                            const isSelecionado = dataInicio === d.dataIso && dataFim === d.dataIso;
                            return (
                                <div
                                    key={i}
                                    onClick={() => filtrarPorPeriodo(d.dataIso, d.dataIso)}
                                    title={`Ver o dia ${d.dia}`}
                                    className={`flex-1 min-w-[32px] group flex flex-col justify-end h-full relative rounded-lg transition-colors p-0.5 cursor-pointer ${isSelecionado ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                >
                                    <div
                                        className={`w-full rounded-t-sm relative ${isHoje ? 'bg-[#22C55E] shadow-[0_0_15px_rgba(34,197,94,0.4)]' : d.valor > 0 ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'bg-white/5'} ${isSelecionado ? 'ring-2 ring-white' : ''}`}
                                        style={{ height: d.valor > 0 ? `${height}%` : '4px' }}
                                    >
                                        {d.valor > 0 && (
                                            <span className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black tracking-tighter whitespace-nowrap z-10 ${isHoje ? 'text-[#22C55E]' : 'text-orange-500'}`}>
                                                {formatCompact(d.valor)}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`text-[9px] text-center font-bold mt-1 ${isHoje ? 'text-[#22C55E]' : d.valor > 0 ? 'text-white' : 'text-slate-600'}`}>{d.dia}</span>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4">
                    <CalendarDays size={14} className="text-blue-400"/> Evolução Mensal — {new Date().getFullYear()}
                </h3>
                <div className="flex items-end h-40 gap-1.5 w-full pt-8">
                    {(() => {
                        const evolucaoMensal = statsComercial.evolucaoMensal;
                        const valores = evolucaoMensal.map(m => m.valor).filter(v => v > 0);
                        const maxVal = Math.max(...valores, 1);
                        const fechados = evolucaoMensal.filter(m => !m.isCurrent && m.valor > 0).map(m => m.valor);
                        const minVal = Math.min(...(fechados.length > 0 ? fechados : valores), maxVal);
                        const scaleBase = minVal * 0.75;
                        const scaleRange = Math.max(maxVal - scaleBase, 1);
                        const anoAtual = new Date().getFullYear();
                        return evolucaoMensal.map((m, i) => {
                            const anterior = i > 0 ? evolucaoMensal[i - 1].valor : 0;
                            const variacao = anterior > 0 ? ((m.valor - anterior) / anterior) * 100 : null;
                            const altura = m.valor > 0 ? Math.max(((m.valor - scaleBase) / scaleRange) * 100, 5) : 0;
                            const iniMes = getLocalYYYYMMDD(new Date(anoAtual, i, 1));
                            const fimMes = getLocalYYYYMMDD(new Date(anoAtual, i + 1, 0));
                            const isSelecionado = dataInicio === iniMes && dataFim === fimMes;
                            return (
                                <div
                                    key={i}
                                    onClick={() => filtrarPorPeriodo(iniMes, fimMes)}
                                    title={`Ver ${m.label}`}
                                    className={`flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer rounded-lg transition-colors ${isSelecionado ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                >
                                    {m.valor > 0 && (
                                        <div className="absolute flex flex-col items-center gap-0.5" style={{ bottom: `calc(${altura}% + 6px)` }}>
                                            <span className="text-[9px] font-black text-white whitespace-nowrap">{formatCompact(m.valor)}</span>
                                            {variacao !== null && (
                                                <span className={`text-[8px] font-black whitespace-nowrap ${variacao >= 0 ? 'text-[#22C55E]' : 'text-red-500'}`}>
                                                    {variacao >= 0 ? '+' : ''}{Math.round(variacao)}%
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className={`w-full rounded-t-lg transition-all duration-700 ${m.isCurrent ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'bg-blue-600/70'} ${isSelecionado ? 'ring-2 ring-white' : ''}`} style={{ height: `${altura}%` }} />
                                    <span className={`text-[8px] font-black mt-1.5 ${m.isCurrent ? 'text-orange-400' : 'text-slate-500'}`}>{m.label}</span>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-white mb-3">
                        <Users size={14} className="text-orange-500" /> {isCDL ? 'Ranking de Captadores' : 'Ranking'} ({filtroUnidade})
                        <span className="text-[8px] bg-white/10 px-1.5 py-0.5 rounded text-slate-400 not-italic font-normal">Clique para isolar</span>
                    </h3>
                    <div className="space-y-2 overflow-y-auto max-h-[200px] pr-1 custom-scrollbar">
                        {ranking.map((r, index) => (
                            <div key={r.id} onClick={() => handleSellerClick(r.id)} className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all group ${vendedorSelecionado === r.id ? 'bg-orange-500/10 border-orange-500' : 'bg-white/5 border-white/5 hover:border-orange-500/50'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${index === 0 ? 'bg-orange-500 text-[#0B1120]' : 'bg-blue-600 text-white'}`}>{index + 1}º</div>
                                    <div><p className="font-black uppercase text-xs text-white">{r.nome}</p><p className="text-[9px] text-slate-500 font-bold">{r.count} Leads · {r.vendas} Vendas · {r.visitas} Visitas</p></div>
                                </div>
                                <p className={`text-sm font-black ${vendedorSelecionado === r.id ? 'text-orange-500' : 'text-slate-300'}`}>R$ {r.total.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="lg:col-span-1 bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black text-white uppercase italic mb-3 flex items-center gap-2"><Target size={14} className="text-blue-500"/> Funil</h3>
                    <div className="space-y-2">
                        <div onClick={() => irParaDeals()} className="flex justify-between py-1.5 border-b border-white/5 cursor-pointer hover:bg-white/5 rounded-lg px-1 -mx-1 transition-colors"><span className="text-[10px] text-slate-400 font-bold uppercase">Abertos</span><span className="text-xs font-black text-white">{statsComercial.leadsAbertos}</span></div>
                        <div onClick={() => irParaDeals({ etapa: '4' })} className="flex justify-between py-1.5 border-b border-white/5 cursor-pointer hover:bg-white/5 rounded-lg px-1 -mx-1 transition-colors"><span className="text-[10px] text-orange-500 font-bold uppercase">{isCDL ? 'Filiados' : 'Ganhos'}</span><span className="text-xs font-black text-orange-500">{statsComercial.funil.ganho}</span></div>
                        <div onClick={() => irParaDeals({ etapa: '5' })} className="flex justify-between py-1.5 border-b border-white/5 cursor-pointer hover:bg-white/5 rounded-lg px-1 -mx-1 transition-colors"><span className="text-[10px] text-red-500 font-bold uppercase">Perdidos</span><span className="text-xs font-black text-red-500">{statsComercial.funil.perdido}</span></div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl flex flex-col">
                    <h3 className="text-sm font-black text-white uppercase italic mb-4 flex items-center gap-2"><MapPin size={14} className="text-blue-400"/> Funil de Visitas</h3>
                    {(() => {
                        const vr = statsComercial.visitasRegistradas;
                        const vc = statsComercial.visitasConvertidas;
                        const vg = statsComercial.visitasGanhas;
                        const steps = [
                            { label: 'Registradas', val: vr, color: 'bg-blue-500', pct: 100, filtroLead: 'todos' as const },
                            { label: 'Lead', val: vc, color: 'bg-yellow-500', pct: vr > 0 ? Math.round((vc/vr)*100) : 0, filtroLead: 'com_lead' as const },
                            { label: 'Venda', val: vg, color: 'bg-green-500', pct: vr > 0 ? Math.round((vg/vr)*100) : 0, filtroLead: 'com_lead' as const },
                        ];
                        return (
                            <div className="space-y-3 flex-1 justify-center flex flex-col">
                                {steps.map((s, i) => (
                                    <div key={i} onClick={() => irParaVisitas({ filtroLead: s.filtroLead })} className="cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition-colors">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{s.label}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-black text-sm">{s.val}</span>
                                                {i > 0 && <span className="text-[9px] text-slate-500 font-bold">{s.pct}%</span>}
                                            </div>
                                        </div>
                                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${s.pct}%` }}/>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
                <div className="lg:col-span-2 bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-3"><BarChart3 size={14} className="text-blue-500"/> Volume por Etapa</h3>
                    <div className="flex items-end h-40 gap-3 px-2 w-full pt-4">
                        {[ { label: isCDL ? 'Prospectos' : 'Novos', val: statsComercial.funil.novos, color: 'bg-blue-600', etapa: 0 }, { label: 'Contato', val: statsComercial.funil.contato, color: 'bg-blue-500', etapa: 1 }, { label: isCDL ? 'Filiação' : 'Proposta', val: statsComercial.funil.proposta, color: 'bg-purple-500', etapa: 2 }, { label: 'Negoc.', val: statsComercial.funil.negociacao, color: 'bg-yellow-500', etapa: 3 }, { label: isCDL ? 'Filiados' : 'Ganhos', val: statsComercial.funil.ganho, color: 'bg-orange-500', etapa: 4 }, ].map((etapa, i, arr) => {
                            const maxEtapa = Math.max(...arr.map(e => e.val), 1);
                            const h = (etapa.val / maxEtapa) * 100;
                            return (
                                <div key={i} onClick={() => irParaDeals({ etapa: String(etapa.etapa) })} className="flex-1 flex flex-col items-center justify-end group h-full relative cursor-pointer">
                                    <div className="mb-1 text-[10px] font-black text-white">{etapa.val}</div>
                                    <div className={`w-full rounded-t-lg transition-all duration-1000 ${etapa.color} opacity-90 group-hover:opacity-100 relative`} style={{ height: `${Math.max(h, 2)}%` }}>
                                        {etapa.val > 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50"></div>}
                                    </div>
                                    <div className="mt-2 text-[8px] font-black uppercase text-slate-500 tracking-wider text-center group-hover:text-slate-300 transition-colors">{etapa.label}</div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* PREVISÃO + RENOVAÇÕES */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

                {/* PREVISÃO DE FECHAMENTO */}
                <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4">
                        <TrendingUp size={14} className="text-purple-400"/> Previsão de Fechamento
                    </h3>
                    <p className="text-3xl font-black text-purple-400 tracking-tight">
                        R$ {previsaoFechamento.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}
                    </p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 mb-4">Já ganho no período + pipeline aberto por probabilidade</p>
                    <div className="space-y-1.5">
                        {[
                            { label: isCDL ? 'Novo Prospecto' : 'Novo Lead', pct: '10%', color: 'bg-slate-500' },
                            { label: 'Em Contato', pct: '25%', color: 'bg-blue-500' },
                            { label: isCDL ? 'Proposta de Filiação' : 'Proposta', pct: '45%', color: 'bg-yellow-500' },
                            { label: 'Negociação', pct: '70%', color: 'bg-purple-500' },
                        ].map((s, i) => (
                            <div key={i} className="flex items-center gap-2 text-[9px]">
                                <div className={`w-2 h-2 rounded-full ${s.color}`}/>
                                <span className="text-slate-400 font-bold uppercase flex-1">{s.label}</span>
                                <span className="text-white font-black">{s.pct}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CONTRATOS VENCENDO */}
                <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4">
                        <AlertCircle size={14} className="text-orange-400"/> {isCDL ? 'Anuidades Vencendo — Próx. 30 Dias' : 'Renovações nos Próx. 30 Dias'}
                        {contratosVencendo.length > 0 && (
                            <span className="ml-auto bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse">
                                {contratosVencendo.length}
                            </span>
                        )}
                    </h3>
                    {contratosVencendo.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-slate-600 text-xs font-bold uppercase">Nenhum contrato vencendo</div>
                    ) : (
                        <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                            {contratosVencendo.map((c: any, i: number) => {
                                const fim = new Date(c.contrato_fim + 'T00:00:00');
                                const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
                                const dias = Math.ceil((fim.getTime() - hoje2.getTime()) / (1000 * 60 * 60 * 24));
                                return (
                                    <div key={i} onClick={() => irParaDeals({ leadId: String(c.id) })} className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-xl px-3 py-2 cursor-pointer hover:border-orange-500/50 transition-colors">
                                        <span className="text-xs font-bold text-white truncate flex-1">{c.empresa}</span>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ml-2 shrink-0 ${dias <= 7 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                            {dias}d
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

    </main>
  );
}