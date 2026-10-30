"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Building2, Plus, X, Loader2, Users, Package,
  ShieldAlert, ChevronRight, Search,
  BarChart2, TrendingUp, Clock, Activity, Target, Printer, LogIn,
  DollarSign, Globe, PenLine, Edit2, AlertTriangle, XCircle, MessageCircle,
  CheckCircle2, KeyRound, Trash2, Sparkles, Radio, RefreshCw, Handshake,
} from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';
import { Empresa, Estagio, estagioEmpresa, ESTAGIO_CFG, headersAuth, diasParaVencer, fmtData, proximoMes, statusPgto, BILLING_VAZIO, emitirNfMensalidade } from './abas/types';
import AbaGeral from './abas/AbaGeral';
import AbaModulos from './abas/AbaModulos';
import AbaUnidades from './abas/AbaUnidades';
import AbaMetricas from './abas/AbaMetricas';
import AbaFaturamento from './abas/AbaFaturamento';
import AbaPortais from './abas/AbaPortais';
import AbaDocumentos from './abas/AbaDocumentos';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function tempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

type Aba = 'geral' | 'modulos' | 'unidades' | 'faturamento' | 'portais' | 'documentos' | 'metricas';
const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: 'geral', label: 'Geral', icon: <Edit2 size={14}/> },
  { id: 'modulos', label: 'Módulos', icon: <Package size={14}/> },
  { id: 'unidades', label: 'Unidades', icon: <Building2 size={14}/> },
  { id: 'faturamento', label: 'Faturamento', icon: <DollarSign size={14}/> },
  { id: 'portais', label: 'Portais', icon: <Globe size={14}/> },
  { id: 'documentos', label: 'Documentos', icon: <PenLine size={14}/> },
  { id: 'metricas', label: 'Métricas', icon: <BarChart2 size={14}/> },
];

const STATUS_PGTO_CFG = {
  ativo:        { label: 'Em dia',          cor: 'bg-[#22C55E]/10 text-[#4ADE80] border-[#22C55E]/25',    icon: <CheckCircle2 size={11}/> },
  vencendo:     { label: 'Vence em breve',  cor: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25', icon: <Clock size={11}/> },
  inadimplente: { label: 'Vencido',         cor: 'bg-red-500/10 text-red-300 border-red-500/25',          icon: <AlertTriangle size={11}/> },
  sem_dados:    { label: 'Sem faturamento', cor: 'bg-slate-500/10 text-slate-400 border-slate-500/25',    icon: <XCircle size={11}/> },
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<Aba>('geral');
  const [atividade, setAtividade] = useState<{
    leads_mes: number; usuarios_ativos_7d: number;
    ultimos_logins: { nome: string; empresa: string; ultimo_acesso: string }[];
    por_empresa: { id: string; nome: string; status: string; total_usuarios: number; usuarios_ativos_7d: number; leads_mes: number; leads_total: number; ultimo_acesso: string | null }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [entrandoComoId, setEntrandoComoId] = useState<string | null>(null);
  const [resetandoSenhaId, setResetandoSenhaId] = useState<string | null>(null);
  const [senhaResetada, setSenhaResetada] = useState<{ email: string; senha: string } | null>(null);
  const [senhaResetadaCopiada, setSenhaResetadaCopiada] = useState(false);
  const [excluindoEmpresa, setExcluindoEmpresa] = useState<Empresa | null>(null);
  const [confirmarNomeExcluir, setConfirmarNomeExcluir] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);

  const [modoLista, setModoLista] = useState<'empresas' | 'cobranca'>('empresas');
  const [busca, setBusca] = useState('');
  const [filtroEstagio, setFiltroEstagio] = useState<'todas' | Estagio>('todas');
  const [convertendoId, setConvertendoId] = useState<string | null>(null);
  const [registrandoPgtoId, setRegistrandoPgtoId] = useState<string | null>(null);

  // Form nova empresa
  const [showNovaEmpresa, setShowNovaEmpresa] = useState(false);
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('');
  const [novaEmpresaCnpj, setNovaEmpresaCnpj] = useState('');
  const [novaEmpresaDiretorNome, setNovaEmpresaDiretorNome] = useState('');
  const [novaEmpresaDiretorEmail, setNovaEmpresaDiretorEmail] = useState('');
  const [novaEmpresaDemo, setNovaEmpresaDemo] = useState(false);
  const [novaEmpresaFeedback, setNovaEmpresaFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);
  const [novaEmpresaCredenciais, setNovaEmpresaCredenciais] = useState<{ email: string; senha: string } | null>(null);
  const [credenciaisCopiadas, setCredenciaisCopiadas] = useState(false);

  const isAdmin = !authLoading && user && ADMIN_EMAILS.includes(user.email || '');

  // Esc fecha o painel lateral da empresa (os modais por cima dele têm prioridade).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !excluindoEmpresa && !senhaResetada && !showNovaEmpresa) setEmpresaSelecionada(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [excluindoEmpresa, senhaResetada, showNovaEmpresa]);

  // Vindo de /admin/prospeccao ("Criar empresa em teste"): abre o formulário já preenchido.
  // Empresa nasce em teste (status trial) — vira cliente só no botão "Converter em cliente".
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('novaEmpresa') !== '1') return;
    setNovaEmpresaNome(q.get('nome') || '');
    setNovaEmpresaDiretorNome(q.get('contato') || '');
    setShowNovaEmpresa(true);
    window.history.replaceState(null, '', '/admin');
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => {
    if (token) carregarEmpresas(true);
  }, [token]);

  const headers = () => headersAuth(token);

  // mostrarLoading=false (padrão) é o caso comum: salvar algo numa aba já aberta chama
  // isso só pra manter a lista/empresaSelecionada em sincronia com o banco — não pode
  // piscar a lista inteira em skeleton de loading a cada clique de toggle, senão parece
  // que "a tela muda"/perde o que acabou de ser marcado. Só a carga inicial (token pronto)
  // passa true de propósito.
  const carregarEmpresas = async (mostrarLoading = false) => {
    if (mostrarLoading) setLoading(true);
    setErroCarregamento(null);
    try {
      const [resEmpresas, resAtividade, resBillings] = await Promise.all([
        fetch('/api/admin/empresas', { headers: headers() }),
        fetch('/api/admin/atividade', { headers: headers() }),
        supabase.from('clientes_wegrow').select('*'),
      ]);
      const empresasData = resEmpresas.ok ? await resEmpresas.json() : [];
      const billingMap = Object.fromEntries((resBillings.data || []).map((b: any) => [b.empresa_id, b]));
      setEmpresas(empresasData.map((e: any) => ({ ...e, billing: billingMap[e.id] ?? null })));
      if (resAtividade.ok) setAtividade(await resAtividade.json());
      // mantém a empresa selecionada em sincronia com os dados recarregados
      setEmpresaSelecionada(prev => {
        if (!prev) return prev;
        const atualizada = empresasData.find((e: any) => e.id === prev.id);
        return atualizada ? { ...atualizada, billing: billingMap[atualizada.id] ?? null } : prev;
      });
    } catch (err: any) {
      // "Failed to fetch" acontece por qualquer instabilidade de rede de quem tá acessando
      // (não é bug de lógica) — sem esse catch, a tela ficava carregando pra sempre em
      // silêncio (setLoading(false) nunca rodava) e o erro só aparecia pro Sentry, sem
      // feedback nenhum nem jeito de tentar de novo sem dar F5.
      console.error('[admin/carregarEmpresas]', err);
      setErroCarregamento(err?.message === 'Failed to fetch'
        ? 'Não consegui carregar — confira sua conexão e tente de novo.'
        : (err?.message || 'Erro ao carregar os dados.'));
    } finally {
      setLoading(false);
    }
  };

  // Teste virou contrato fechado: só troca status pra 'ativa' (vira Cliente, entra no MRR).
  const converterEmCliente = async (emp: Empresa) => {
    if (!confirm(`Converter "${emp.nome}" em cliente? Ela passa a contar no MRR e na cobrança.`)) return;
    setConvertendoId(emp.id);
    try {
      const res = await fetch('/api/admin/empresas', { method: 'PATCH', headers: headers(), body: JSON.stringify({ id: emp.id, status: 'ativa' }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.erro || `Erro ao converter (HTTP ${res.status}).`); return; }
      await carregarEmpresas();
    } finally { setConvertendoId(null); }
  };

  const abrirEmpresa = (e: Empresa, aba: Aba = 'geral') => {
    setEmpresaSelecionada(e);
    setAbaAtiva(aba);
  };

  const criarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNovaEmpresaFeedback(null);
    try {
      const res = await fetch('/api/admin/empresas', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          nome: novaEmpresaNome, cnpj: novaEmpresaCnpj, diretorNome: novaEmpresaDiretorNome, diretorEmail: novaEmpresaDiretorEmail,
          modulos: novaEmpresaDemo ? { demo: true } : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNovaEmpresaFeedback({ tipo: 'erro', msg: json.erro || `Erro ao criar empresa (HTTP ${res.status}).` });
        return;
      }
      const avisoEmail = json.emailErro ? ` (e-mail de boas-vindas não saiu: ${json.emailErro} — passe o login manualmente)` : '';
      setNovaEmpresaFeedback({ tipo: json.emailErro ? 'erro' : 'sucesso', msg: `Empresa criada! Login: ${json.diretorEmail} · Senha temporária: ${json.senhaTemp}${avisoEmail}` });
      setNovaEmpresaCredenciais({ email: json.diretorEmail, senha: json.senhaTemp });
      setNovaEmpresaNome(''); setNovaEmpresaCnpj(''); setNovaEmpresaDiretorNome(''); setNovaEmpresaDiretorEmail(''); setNovaEmpresaDemo(false);
      await carregarEmpresas();
      // já abre a empresa recém-criada no painel de abas — sem precisar caçar ela na lista
      setEmpresaSelecionada({ ...json, billing: null });
      setAbaAtiva('geral');
      // fica registrado na aba Faturamento (Observação) — a senha só aparece 1x nesta
      // tela e some pra sempre depois; se o usuário fechar o modal antes de copiar, sem
      // isso o login vira inacessível (Supabase não guarda a senha em texto puro).
      await supabase.from('clientes_wegrow').upsert(
        { empresa_id: json.id, observacao: `Login inicial: ${json.diretorEmail} · Senha temporária: ${json.senhaTemp} (gerada em ${new Date().toLocaleDateString('pt-BR')})` },
        { onConflict: 'empresa_id' }
      );
      // NÃO fecha o modal sozinho — some rápido demais pro usuário copiar a senha.
      // Fecha só quando ele clicar em "Continuar" (abaixo).
    } catch (err: any) {
      setNovaEmpresaFeedback({ tipo: 'erro', msg: 'Erro de rede ao criar empresa: ' + (err?.message || 'desconhecido') });
    } finally {
      setSaving(false);
    }
  };

  const entrarComoEmpresa = async (empresaId: string) => {
    setEntrandoComoId(empresaId);
    try {
      const res = await fetch('/api/admin/entrar-como', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.link) { alert(json.erro || 'Erro ao gerar acesso.'); return; }
      window.open(json.link, '_blank');
    } finally {
      setEntrandoComoId(null);
    }
  };

  const resetarSenha = async (empresaId: string) => {
    setResetandoSenhaId(empresaId);
    try {
      const res = await fetch('/api/admin/resetar-senha', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.senha) { alert(json.erro || 'Erro ao resetar senha.'); return; }
      setSenhaResetada({ email: json.email, senha: json.senha });
      // acrescenta na observação em vez de sobrescrever — empresa já existente pode ter
      // anotações de faturamento/contato ali que não podem se perder.
      const notaAnterior = empresas.find(e => e.id === empresaId)?.billing?.observacao;
      const novaNota = `Senha resetada: ${json.email} · Nova senha: ${json.senha} (gerada em ${new Date().toLocaleDateString('pt-BR')})`;
      await supabase.from('clientes_wegrow').upsert(
        { empresa_id: empresaId, observacao: notaAnterior ? `${notaAnterior}\n\n${novaNota}` : novaNota },
        { onConflict: 'empresa_id' }
      );
      carregarEmpresas();
    } finally {
      setResetandoSenhaId(null);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluindoEmpresa) return;
    setExcluindo(true);
    setErroExcluir(null);
    try {
      const res = await fetch('/api/admin/empresas/excluir', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ empresa_id: excluindoEmpresa.id, confirmarNome: confirmarNomeExcluir }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErroExcluir(json.erro || 'Erro ao excluir empresa.'); return; }
      setExcluindoEmpresa(null);
      setConfirmarNomeExcluir('');
      setEmpresaSelecionada(null);
      await carregarEmpresas();
    } finally {
      setExcluindo(false);
    }
  };

  const registrarPagamentoRapido = async (e: Empresa) => {
    setRegistrandoPgtoId(e.id);
    const atual = e.billing?.proximo_vencimento ?? new Date().toISOString().substring(0, 10);
    await supabase.from('clientes_wegrow').upsert(
      { ...BILLING_VAZIO(e.id), ...(e.billing ?? {}), empresa_id: e.id, proximo_vencimento: proximoMes(atual) },
      { onConflict: 'empresa_id' }
    );
    // Mensalidade paga → NFS-e da competência quitada (só se a automação estiver ligada em Notas fiscais).
    const nf = await emitirNfMensalidade(token, e.id, atual.substring(0, 7), 'pagamento_recebido');
    if (!nf.ok && !nf.msg.includes('desligada')) alert(`Pagamento registrado, mas a nota fiscal não saiu: ${nf.msg}`);
    setRegistrandoPgtoId(null);
    carregarEmpresas();
  };

  if (authLoading) return <div className="p-4 md:p-8"><SkeletonPage /></div>;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center">
        <ShieldAlert className="mx-auto text-red-500 mb-4" size={48}/>
        <p className="text-white font-black text-2xl uppercase">Acesso Restrito</p>
        <p className="text-slate-500 text-sm mt-2">Apenas administradores do sistema.</p>
      </div>
    </div>
  );

  // "Ativas" pra MRR/cobrança/custo = só cliente de verdade (fechado e operando) — teste,
  // demo e suspensa não faturam e não podem inflar esses números.
  const contagemEstagio = empresas.reduce((acc, e) => { acc[estagioEmpresa(e)]++; return acc; }, { cliente: 0, teste: 0, demo: 0, suspensa: 0 } as Record<Estagio, number>);
  const empresasAtivas = empresas.filter(e => estagioEmpresa(e) === 'cliente');
  const idsClientes = new Set(empresasAtivas.map(e => e.id));
  const mrr = empresasAtivas.reduce((s, c) => s + (c.billing?.valor_mensal ?? 0), 0);
  const vencendoBreve = empresasAtivas.filter(c => statusPgto(c.billing) === 'vencendo');
  const inadimplentes = empresasAtivas.filter(c => statusPgto(c.billing) === 'inadimplente');
  const semDados = empresasAtivas.filter(c => statusPgto(c.billing) === 'sem_dados');
  const custoSupabase = empresasAtivas.length <= 20 ? 160 : empresasAtivas.length <= 60 ? 280 : empresasAtivas.length <= 120 ? 450 : 650;
  const custoFerramentas = 50 + 159 + custoSupabase + 115 + 105 + 260;
  const lucroLiquido = mrr - mrr * 0.06 - custoFerramentas;
  const arpu = empresasAtivas.length > 0 ? mrr / empresasAtivas.length : 0;

  const listaBase = modoLista === 'cobranca'
    ? [...empresasAtivas].sort((a, b) => {
        const da = diasParaVencer(a.billing?.proximo_vencimento ?? null);
        const db = diasParaVencer(b.billing?.proximo_vencimento ?? null);
        if (da === null && db === null) return 0;
        if (da === null) return 1; if (db === null) return -1;
        return da - db;
      })
    : empresas;
  const listaFiltrada = listaBase.filter(e => !busca.trim() || e.nome.toLowerCase().includes(busca.toLowerCase()));

  // Uso por empresa (usuários ativos, leads, último acesso) vem de /api/admin/atividade.
  const usoPorEmpresa = new Map((atividade?.por_empresa || []).map(p => [p.id, p]));
  const contagemFiltro: Record<'todas' | Estagio, number> = { todas: empresas.length, ...contagemEstagio };
  const linhas = listaFiltrada
    .filter(e => modoLista === 'cobranca' || filtroEstagio === 'todas' || estagioEmpresa(e) === filtroEstagio)
    .sort((a, b) => modoLista === 'cobranca' ? 0 : ORDEM_ESTAGIO[estagioEmpresa(a)] - ORDEM_ESTAGIO[estagioEmpresa(b)] || (b.billing?.valor_mensal ?? 0) - (a.billing?.valor_mensal ?? 0) || a.nome.localeCompare(b.nome));

  const hoje = new Date();
  const meses6 = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
    const count = empresas.filter(e => {
      const c = new Date(e.created_at);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).length;
    return { label: MESES_PT[d.getMonth()], count };
  });
  const maxMes = Math.max(1, ...meses6.map(m => m.count));
  const novasNoMes = meses6[5].count;
  const usuariosTotais = (atividade?.por_empresa || []).filter(p => idsClientes.has(p.id)).reduce((s, p) => s + p.total_usuarios, 0);

  return (
    <div className="text-white pb-20">
      <div className="max-w-7xl mx-auto">

        {/* Título só aparece impresso/exportado */}
        <div className="hidden print:block mb-8">
          <div className="text-xl font-semibold">WeGrow · Visão geral</div>
          <p className="text-xs">{hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>

        {/* Cabeçalho da página */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-4 mb-6 print:hidden">
          <div>
            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight">Visão geral</h1>
            <p className="text-sm text-slate-400 mt-1">
              {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · {empresas.length} empresas na plataforma
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => carregarEmpresas()} title="Atualizar" className={BTN_SEC}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
            </button>
            <button onClick={() => window.print()} title="Gerar apresentação (imprimir / salvar PDF)" className={BTN_SEC}>
              <Printer size={15}/> <span className="hidden sm:inline">Exportar</span>
            </button>
            <button onClick={() => setShowNovaEmpresa(true)} className={BTN_PRI}>
              <Plus size={15}/> Nova empresa
            </button>
          </div>
        </div>

        {erroCarregamento && !loading && (
          <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl p-4 mb-6 flex items-center justify-between gap-3">
            <p className="text-red-300 text-sm flex items-center gap-2"><AlertTriangle size={15} className="shrink-0"/> {erroCarregamento}</p>
            <button onClick={() => carregarEmpresas(true)} className="shrink-0 flex items-center gap-1.5 text-red-300 hover:text-red-200 text-sm font-medium">
              <RefreshCw size={13}/> Tentar de novo
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden mb-6">
          <Kpi titulo="Receita recorrente (MRR)" valor={brl(mrr)} sub={`ARPU ${brl(arpu)}`} icone={<DollarSign size={15}/>} destaque/>
          <Kpi titulo="Clientes operando" valor={String(contagemEstagio.cliente)} sub={`${contagemEstagio.teste} em teste · ${contagemEstagio.demo} ${contagemEstagio.demo === 1 ? 'demo' : 'demos'}`} icone={<Building2 size={15}/>}/>
          <Kpi titulo="Usuários ativos (7d)" valor={String(atividade?.usuarios_ativos_7d ?? '—')} sub={usuariosTotais ? `de ${usuariosTotais} usuários em clientes` : 'logins nos últimos 7 dias'} icone={<Users size={15}/>}/>
          <Kpi titulo="Leads criados no mês" valor={String(atividade?.leads_mes ?? '—')} sub="em todas as empresas" icone={<TrendingUp size={15}/>}/>
        </div>

        {/* Crescimento + saúde financeira + atividade */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <Card titulo="Novas empresas" acao={<span className="text-xs text-slate-500">últimos 6 meses</span>}>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-semibold tabular-nums">{novasNoMes}</span>
              <span className="text-sm text-slate-400">neste mês</span>
            </div>
            <div className="flex items-end gap-2 h-28">
              {meses6.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <span className="text-[11px] text-slate-400 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{m.count}</span>
                  <div className={`w-full rounded-md transition-all ${i === 5 ? 'bg-[#22C55E]' : 'bg-white/10 group-hover:bg-white/20'}`} style={{ height: `${Math.max(4, (m.count / maxMes) * 100)}%` }}/>
                  <span className="text-[11px] text-slate-500 capitalize">{m.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card titulo="Saúde financeira" acao={<button onClick={() => setModoLista('cobranca')} className="text-xs text-[#22C55E] hover:underline print:hidden">Ver cobrança</button>}>
            <div className="space-y-3">
              <Linha label="Lucro líquido estimado" valor={brl(lucroLiquido)} cor={lucroLiquido >= 0 ? 'text-[#22C55E]' : 'text-red-400'}/>
              <Linha label="Custo de ferramentas" valor={brl(custoFerramentas)}/>
              <div className="h-px bg-white/[0.06]"/>
              <Linha label="Em dia" valor={String(empresasAtivas.length - vencendoBreve.length - inadimplentes.length - semDados.length)} ponto="bg-[#22C55E]"/>
              <Linha label="Vencem em até 7 dias" valor={String(vencendoBreve.length)} ponto="bg-yellow-400"/>
              <Linha label="Vencidos" valor={String(inadimplentes.length)} ponto="bg-red-400" cor={inadimplentes.length ? 'text-red-400' : undefined}/>
              <Linha label="Sem faturamento cadastrado" valor={String(semDados.length)} ponto="bg-slate-500"/>
            </div>
          </Card>

          <Card titulo="Atividade recente" acao={<span className="text-xs text-slate-500">últimos logins</span>}>
            {!atividade ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-white/[0.03] rounded-lg animate-pulse"/>)}</div>
            ) : atividade.ultimos_logins.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">Sem logins recentes.</p>
            ) : (
              <div className="space-y-3">
                {atividade.ultimos_logins.slice(0, 6).map((l, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-[11px] font-semibold text-slate-300 shrink-0">{iniciais(l.nome)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium truncate">{l.nome}</p>
                      <p className="text-xs text-slate-500 truncate">{l.empresa}</p>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0 tabular-nums">{tempoRelativo(l.ultimo_acesso)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Empresas */}
        <div className="bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="p-4 md:px-5 border-b border-white/[0.06] flex flex-col lg:flex-row lg:items-center gap-3 justify-between print:hidden">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-semibold">{modoLista === 'empresas' ? 'Empresas' : 'Cobrança'}</h2>
              <div className="flex items-center bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5">
                {(['empresas', 'cobranca'] as const).map(m => (
                  <button key={m} onClick={() => setModoLista(m)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${modoLista === m ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                    {m === 'empresas' ? 'Todas as empresas' : 'Cobrança'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {modoLista === 'empresas' && (
                <div className="flex items-center gap-1 flex-wrap">
                  {(['todas', 'cliente', 'teste', 'demo', 'suspensa'] as const).map(f => (
                    <button key={f} onClick={() => setFiltroEstagio(f)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${filtroEstagio === f ? 'bg-white text-[#0B1120] border-white' : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'}`}>
                      {f === 'todas' ? 'Todas' : ESTAGIO_CFG[f].plural} <span className={filtroEstagio === f ? 'text-slate-500' : 'text-slate-600'}>{contagemFiltro[f]}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center bg-white/[0.04] border border-white/[0.08] focus-within:border-[#22C55E]/50 rounded-lg px-3 py-1.5 gap-2 w-full sm:w-56 transition-colors">
                <Search size={14} className="text-slate-500"/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa" className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-slate-500 min-w-0"/>
              </div>
            </div>
          </div>

          {modoLista === 'cobranca' && (inadimplentes.length > 0 || vencendoBreve.length > 0) && (
            <div className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex flex-wrap gap-x-6 gap-y-1 text-xs print:hidden">
              {inadimplentes.length > 0 && <span className="text-red-300 flex items-center gap-1.5"><AlertTriangle size={13}/> Vencidos: {inadimplentes.map(c => c.nome).join(', ')}</span>}
              {vencendoBreve.length > 0 && <span className="text-yellow-300 flex items-center gap-1.5"><Clock size={13}/> Vencem em breve: {vencendoBreve.map(c => `${c.nome} (${diasParaVencer(c.billing?.proximo_vencimento ?? null)}d)`).join(', ')}</span>}
            </div>
          )}

          {loading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-white/[0.03] rounded-lg animate-pulse"/>)}</div>
          ) : linhas.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-14">Nenhuma empresa encontrada.</p>
          ) : modoLista === 'empresas' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-white/[0.06]">
                    <th className="text-left font-medium py-2.5 pl-4 md:pl-5 pr-3">Empresa</th>
                    <th className="text-left font-medium py-2.5 px-3">Estágio</th>
                    <th className="text-right font-medium py-2.5 px-3 hidden md:table-cell">Usuários ativos</th>
                    <th className="text-right font-medium py-2.5 px-3 hidden lg:table-cell">Leads (mês)</th>
                    <th className="text-right font-medium py-2.5 px-3">MRR</th>
                    <th className="text-right font-medium py-2.5 px-3 hidden md:table-cell">Último acesso</th>
                    <th className="w-24 print:hidden"/>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(e => {
                    const est = estagioEmpresa(e);
                    const uso = usoPorEmpresa.get(e.id);
                    const recente = uso?.ultimo_acesso && Date.now() - new Date(uso.ultimo_acesso).getTime() < 3 * 86400000;
                    return (
                      <tr key={e.id} onClick={() => abrirEmpresa(e)}
                        className={`group border-b border-white/[0.04] last:border-0 cursor-pointer transition-colors ${empresaSelecionada?.id === e.id ? 'bg-[#22C55E]/[0.06]' : 'hover:bg-white/[0.025]'}`}>
                        <td className="py-3 pl-4 md:pl-5 pr-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <LogoEmpresa e={e}/>
                            <div className="min-w-0">
                              <p className="font-medium text-white truncate max-w-[220px]">{e.nome}</p>
                              <p className="text-xs text-slate-500 capitalize">{e.plano}{e.parceiro_id ? ' · via parceiro' : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3"><PillEstagio est={est}/></td>
                        <td className="py-3 px-3 text-right tabular-nums hidden md:table-cell">
                          <span className={uso?.usuarios_ativos_7d ? 'text-white' : 'text-slate-500'}>{uso?.usuarios_ativos_7d ?? 0}</span>
                          <span className="text-slate-600"> / {uso?.total_usuarios ?? e.total_usuarios ?? 0}</span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-slate-300 hidden lg:table-cell">{uso?.leads_mes ?? 0}</td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          {est === 'cliente' && e.billing?.valor_mensal ? <span className="text-white font-medium">{brl(e.billing.valor_mensal)}</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-3 px-3 text-right hidden md:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs">
                            {uso?.ultimo_acesso && <span className={`w-1.5 h-1.5 rounded-full ${recente ? 'bg-[#22C55E]' : 'bg-slate-600'}`}/>}
                            {uso?.ultimo_acesso ? tempoRelativo(uso.ultimo_acesso) : '—'}
                          </span>
                        </td>
                        <td className="py-3 pr-4 md:pr-5 print:hidden" onClick={ev => ev.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            {est === 'teste' && (
                              <button onClick={() => converterEmCliente(e)} disabled={convertendoId === e.id} title="Converter em cliente" className={BTN_ICONE + ' hover:text-[#22C55E]'}>
                                {convertendoId === e.id ? <Loader2 size={15} className="animate-spin"/> : <CheckCircle2 size={15}/>}
                              </button>
                            )}
                            <button onClick={() => { setExcluindoEmpresa(e); setConfirmarNomeExcluir(''); setErroExcluir(null); }} title="Excluir empresa" className={BTN_ICONE + ' hover:text-red-400'}>
                              <Trash2 size={15}/>
                            </button>
                            <ChevronRight size={15} className="text-slate-600 ml-1"/>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-white/[0.06]">
                    <th className="text-left font-medium py-2.5 pl-4 md:pl-5 pr-3">Empresa</th>
                    <th className="text-left font-medium py-2.5 px-3">Situação</th>
                    <th className="text-right font-medium py-2.5 px-3">Vencimento</th>
                    <th className="text-right font-medium py-2.5 px-3">Mensalidade</th>
                    <th className="print:hidden"/>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(e => {
                    const cfg = STATUS_PGTO_CFG[statusPgto(e.billing)];
                    const dias = diasParaVencer(e.billing?.proximo_vencimento ?? null);
                    return (
                      <tr key={e.id} onClick={() => abrirEmpresa(e, 'faturamento')} className="border-b border-white/[0.04] last:border-0 cursor-pointer hover:bg-white/[0.025] transition-colors">
                        <td className="py-3 pl-4 md:pl-5 pr-3">
                          <div className="flex items-center gap-3"><LogoEmpresa e={e}/><span className="font-medium truncate max-w-[220px]">{e.nome}</span></div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.cor}`}>{cfg.icon} {cfg.label}</span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          <span className="text-slate-300">{fmtData(e.billing?.proximo_vencimento ?? null)}</span>
                          {dias !== null && dias < 0 && <span className="block text-xs text-red-400">há {Math.abs(dias)} dias</span>}
                          {dias !== null && dias >= 0 && dias <= 7 && <span className="block text-xs text-yellow-400">em {dias} dias</span>}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-medium">{brl(e.billing?.valor_mensal ?? 0)}</td>
                        <td className="py-3 pr-4 md:pr-5 print:hidden" onClick={ev => ev.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => registrarPagamentoRapido(e)} disabled={registrandoPgtoId === e.id}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#22C55E] bg-[#22C55E]/10 hover:bg-[#22C55E]/15 border border-[#22C55E]/20 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                              {registrandoPgtoId === e.id ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>} Pagamento recebido
                            </button>
                            {e.billing?.whatsapp && (
                              <a href={`https://wa.me/55${e.billing.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá${e.billing.contato ? ' ' + e.billing.contato : ''}! Segue o Pix para renovação da assinatura WeGrow — R$ ${(e.billing.valor_mensal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês. Vencimento: ${fmtData(e.billing.proximo_vencimento)}.`)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-2.5 py-1.5 rounded-lg transition-colors">
                                <MessageCircle size={12}/> Cobrar
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Painel lateral da empresa selecionada */}
      {empresaSelecionada && (
        <div className="fixed inset-0 z-40 flex justify-end print:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setEmpresaSelecionada(null)}/>
          <div className="relative w-full max-w-3xl h-full bg-[#0B1120] border-l border-white/[0.08] shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]">
            <div className="p-5 md:p-6 border-b border-white/[0.06]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <LogoEmpresa e={empresaSelecionada} grande/>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">{empresaSelecionada.nome}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <PillEstagio est={estagioEmpresa(empresaSelecionada)}/>
                      <span className="text-xs text-slate-500"><span className="capitalize">{empresaSelecionada.plano}</span> · {empresaSelecionada.total_usuarios ?? 0} {(empresaSelecionada.total_usuarios ?? 0) === 1 ? 'usuário' : 'usuários'}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setEmpresaSelecionada(null)} title="Fechar (Esc)" className={BTN_ICONE}><X size={18}/></button>
              </div>
              <div className="flex items-center gap-2 mt-5 flex-wrap">
                {estagioEmpresa(empresaSelecionada) === 'teste' && (
                  <button onClick={() => converterEmCliente(empresaSelecionada)} disabled={convertendoId === empresaSelecionada.id} className={BTN_PRI + ' disabled:opacity-50'}>
                    {convertendoId === empresaSelecionada.id ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>} Converter em cliente
                  </button>
                )}
                <button onClick={() => entrarComoEmpresa(empresaSelecionada.id)} disabled={entrandoComoId === empresaSelecionada.id} className={BTN_SEC + ' disabled:opacity-50'}>
                  {entrandoComoId === empresaSelecionada.id ? <Loader2 size={14} className="animate-spin"/> : <LogIn size={14}/>} Entrar como
                </button>
                <button onClick={() => resetarSenha(empresaSelecionada.id)} disabled={resetandoSenhaId === empresaSelecionada.id} className={BTN_SEC + ' disabled:opacity-50'}>
                  {resetandoSenhaId === empresaSelecionada.id ? <Loader2 size={14} className="animate-spin"/> : <KeyRound size={14}/>} Gerar nova senha
                </button>
                <button onClick={() => { setExcluindoEmpresa(empresaSelecionada); setConfirmarNomeExcluir(''); setErroExcluir(null); }}
                  className="ml-auto inline-flex items-center gap-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors">
                  <Trash2 size={14}/> Excluir
                </button>
              </div>
            </div>

            <div className="flex px-3 md:px-4 border-b border-white/[0.06] overflow-x-auto [scrollbar-width:none]">
              {ABAS.map(a => (
                <button key={a.id} onClick={() => setAbaAtiva(a.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${abaAtiva === a.id ? 'border-[#22C55E] text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
                  {a.icon} {a.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-6">
              {abaAtiva === 'geral' && <AbaGeral empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
              {abaAtiva === 'modulos' && <AbaModulos empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
              {abaAtiva === 'unidades' && <AbaUnidades empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
              {abaAtiva === 'faturamento' && <AbaFaturamento empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
              {abaAtiva === 'portais' && <AbaPortais empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
              {abaAtiva === 'documentos' && <AbaDocumentos empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
              {abaAtiva === 'metricas' && <AbaMetricas empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
            </div>
          </div>
        </div>
      )}

      {/* Modal Excluir Empresa */}
      {excluindoEmpresa && (
        <Dialogo titulo="Excluir empresa" icone={<Trash2 size={16} className="text-red-400"/>} onFechar={() => setExcluindoEmpresa(null)} perigo>
          <div className="space-y-3">
            <p className="text-sm text-slate-300 leading-relaxed">Isso apaga <span className="font-semibold text-white">{excluindoEmpresa.nome}</span> e todos os logins vinculados a ela — <span className="text-red-400 font-medium">sem volta</span>. Dados em outras tabelas (leads, clientes etc.) não são varridos, mas ficam inacessíveis pra sempre já que ninguém mais loga nessa empresa.</p>
            <p className="text-xs text-slate-500">Digite <span className="font-semibold text-white">{excluindoEmpresa.nome}</span> pra confirmar:</p>
            <input value={confirmarNomeExcluir} onChange={e => setConfirmarNomeExcluir(e.target.value)} className={INPUT + ' focus:border-red-500/50'}/>
            {erroExcluir && <div className="text-sm p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">{erroExcluir}</div>}
            <button onClick={confirmarExclusao} disabled={excluindo || confirmarNomeExcluir.trim() !== excluindoEmpresa.nome}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors">
              {excluindo ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
              {excluindo ? 'Excluindo...' : 'Excluir de verdade'}
            </button>
          </div>
        </Dialogo>
      )}

      {/* Modal Senha Resetada */}
      {senhaResetada && (
        <Dialogo titulo="Nova senha gerada" icone={<KeyRound size={16} className="text-[#22C55E]"/>}>
          <div className="space-y-3">
            <Credencial email={senhaResetada.email} senha={senhaResetada.senha} rotuloSenha="Nova senha"/>
            <p className="text-xs text-slate-500">Essa senha só aparece agora — copie antes de fechar. A senha anterior parou de funcionar. Também ficou salva em <span className="text-slate-300">Faturamento → Observação</span> dessa empresa.</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`Login: ${senhaResetada.email}\nSenha: ${senhaResetada.senha}`);
                setSenhaResetadaCopiada(true);
                setTimeout(() => setSenhaResetadaCopiada(false), 2500);
              }}
              className={BTN_SEC + ' w-full justify-center'}
            >
              {senhaResetadaCopiada ? 'Copiado!' : 'Copiar login e senha'}
            </button>
            <button onClick={() => setSenhaResetada(null)} className={BTN_PRI + ' w-full justify-center'}>Continuar</button>
          </div>
        </Dialogo>
      )}

      {/* Modal Nova Empresa */}
      {showNovaEmpresa && (
        <Dialogo titulo={novaEmpresaCredenciais ? 'Empresa criada' : 'Nova empresa'} icone={<Building2 size={16} className="text-[#22C55E]"/>}
          onFechar={novaEmpresaCredenciais ? undefined : () => { setShowNovaEmpresa(false); setNovaEmpresaFeedback(null); }}>
          {novaEmpresaCredenciais ? (
            <div className="space-y-3">
              {novaEmpresaFeedback?.tipo === 'erro' && (
                <div className="text-sm p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">{novaEmpresaFeedback.msg}</div>
              )}
              <Credencial email={novaEmpresaCredenciais.email} senha={novaEmpresaCredenciais.senha} rotuloSenha="Senha temporária"/>
              <p className="text-xs text-slate-500">Essa senha só aparece agora — copie antes de fechar. Também ficou salva em <span className="text-slate-300">Faturamento → Observação</span>, e o botão <span className="text-slate-300">Entrar como</span> dispensa senha.</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Login: ${novaEmpresaCredenciais.email}\nSenha temporária: ${novaEmpresaCredenciais.senha}`);
                  setCredenciaisCopiadas(true);
                  setTimeout(() => setCredenciaisCopiadas(false), 2500);
                }}
                className={BTN_SEC + ' w-full justify-center'}
              >
                {credenciaisCopiadas ? 'Copiado!' : 'Copiar login e senha'}
              </button>
              <button onClick={() => { setShowNovaEmpresa(false); setNovaEmpresaFeedback(null); setNovaEmpresaCredenciais(null); }} className={BTN_PRI + ' w-full justify-center'}>
                Continuar
              </button>
            </div>
          ) : (
            <form onSubmit={criarEmpresa} className="space-y-3">
              <CampoAdmin label="Nome da empresa"><input required value={novaEmpresaNome} onChange={e => setNovaEmpresaNome(e.target.value)} className={INPUT}/></CampoAdmin>
              <CampoAdmin label="CNPJ" opcional><input value={novaEmpresaCnpj} onChange={e => setNovaEmpresaCnpj(e.target.value)} className={INPUT}/></CampoAdmin>
              <div className="pt-3 border-t border-white/[0.06]">
                <p className="text-xs text-slate-400 mb-3">Primeiro diretor — obrigatório, sem ele a empresa fica invisível.</p>
                <div className="space-y-3">
                  <CampoAdmin label="Nome do diretor"><input required value={novaEmpresaDiretorNome} onChange={e => setNovaEmpresaDiretorNome(e.target.value)} className={INPUT}/></CampoAdmin>
                  <CampoAdmin label="E-mail do diretor"><input required type="email" value={novaEmpresaDiretorEmail} onChange={e => setNovaEmpresaDiretorEmail(e.target.value)} className={INPUT}/></CampoAdmin>
                </div>
              </div>
              <label className="flex items-start gap-2.5 py-1 cursor-pointer">
                <input type="checkbox" checked={novaEmpresaDemo} onChange={e => setNovaEmpresaDemo(e.target.checked)} className="w-4 h-4 mt-0.5 accent-purple-400"/>
                <span className="text-sm text-slate-300">Empresa demo <span className="block text-xs text-slate-500">Dado fake, uso comercial — não é cliente pagante.</span></span>
              </label>
              {novaEmpresaFeedback && (
                <div className={`text-sm p-3 rounded-lg ${novaEmpresaFeedback.tipo === 'sucesso' ? 'bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {novaEmpresaFeedback.msg}
                </div>
              )}
              <button type="submit" disabled={saving} className={BTN_PRI + ' w-full justify-center disabled:opacity-60'}>
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} {saving ? 'Criando...' : 'Criar empresa'}
              </button>
            </form>
          )}
        </Dialogo>
      )}
    </div>
  );
}

const BTN_PRI = 'inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#2BD468] text-[#0B1120] px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-[0_0_0_1px_rgba(34,197,94,.4),0_4px_14px_-4px_rgba(34,197,94,.5)]';
const BTN_SEC = 'inline-flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors';
const BTN_ICONE = 'p-1.5 rounded-md text-slate-500 hover:bg-white/[0.06] transition-colors disabled:opacity-50';
const INPUT = 'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]/60 focus:ring-2 focus:ring-[#22C55E]/15 transition';
const ORDEM_ESTAGIO: Record<Estagio, number> = { cliente: 0, teste: 1, demo: 2, suspensa: 3 };

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

const COR_PILL: Record<Estagio, string> = {
  cliente: 'bg-[#22C55E]/10 text-[#4ADE80] ring-[#22C55E]/25',
  teste: 'bg-yellow-500/10 text-yellow-300 ring-yellow-500/25',
  demo: 'bg-purple-500/10 text-purple-300 ring-purple-400/25',
  suspensa: 'bg-red-500/10 text-red-300 ring-red-500/25',
};

function PillEstagio({ est }: { est: Estagio }) {
  return <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${COR_PILL[est]}`}>{ESTAGIO_CFG[est].label}</span>;
}

function LogoEmpresa({ e, grande }: { e: Empresa; grande?: boolean }) {
  const tam = grande ? 'w-12 h-12 rounded-xl text-sm' : 'w-9 h-9 rounded-lg text-[11px]';
  if (e.logo_url) return (
    <div className={`${tam} bg-white flex items-center justify-center shrink-0 overflow-hidden`}>
      <img src={e.logo_url} alt={e.nome} className="w-full h-full object-contain p-1"/>
    </div>
  );
  return (
    <div className={`${tam} flex items-center justify-center shrink-0 font-semibold text-white ring-1 ring-inset ring-white/10`}
      style={{ background: `linear-gradient(135deg, ${e.cor_primaria || '#334155'}, ${e.cor_primaria || '#334155'}55)` }}>
      {iniciais(e.nome)}
    </div>
  );
}

function Kpi({ titulo, valor, sub, icone, destaque }: { titulo: string; valor: string; sub: string; icone: React.ReactNode; destaque?: boolean }) {
  return (
    <div className="bg-[#0F172A] p-5 relative overflow-hidden">
      {destaque && <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#22C55E]/15 blur-3xl pointer-events-none"/>}
      <div className="relative flex items-center justify-between">
        <p className="text-[13px] text-slate-400">{titulo}</p>
        <span className={`w-7 h-7 rounded-md flex items-center justify-center ${destaque ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-white/[0.05] text-slate-400'}`}>{icone}</span>
      </div>
      <p className="relative text-2xl md:text-[28px] font-semibold tracking-tight tabular-nums mt-3">{valor}</p>
      <p className="relative text-xs text-slate-500 mt-1 truncate">{sub}</p>
    </div>
  );
}

function Card({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {acao}
      </div>
      {children}
    </div>
  );
}

function Linha({ label, valor, cor, ponto }: { label: string; valor: string; cor?: string; ponto?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400 flex items-center gap-2">{ponto && <span className={`w-1.5 h-1.5 rounded-full ${ponto}`}/>}{label}</span>
      <span className={`tabular-nums font-medium ${cor || 'text-white'}`}>{valor}</span>
    </div>
  );
}

function Dialogo({ titulo, icone, onFechar, perigo, children }: { titulo: string; icone: React.ReactNode; onFechar?: () => void; perigo?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-[#0F172A] border rounded-2xl p-6 w-full max-w-md shadow-2xl ${perigo ? 'border-red-500/30' : 'border-white/10'}`}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-semibold text-base flex items-center gap-2">{icone} {titulo}</h3>
          {onFechar && <button onClick={onFechar} className={BTN_ICONE}><X size={16}/></button>}
        </div>
        {children}
      </div>
    </div>
  );
}

function CampoAdmin({ label, opcional, children }: { label: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] text-slate-300 mb-1.5 block">{label} {opcional && <span className="text-slate-500">(opcional)</span>}</span>
      {children}
    </label>
  );
}

function Credencial({ email, senha, rotuloSenha }: { email: string; senha: string; rotuloSenha: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl divide-y divide-white/[0.06]">
      <div className="p-3.5">
        <p className="text-xs text-slate-500">Login</p>
        <p className="text-sm font-medium text-white break-all mt-0.5">{email}</p>
      </div>
      <div className="p-3.5">
        <p className="text-xs text-slate-500">{rotuloSenha}</p>
        <p className="text-lg font-semibold text-[#22C55E] font-mono tracking-wide mt-0.5">{senha}</p>
      </div>
    </div>
  );
}
