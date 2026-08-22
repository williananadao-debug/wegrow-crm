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
  CheckCircle2,
} from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';
import { Empresa, headersAuth, diasParaVencer, fmtData, proximoMes, statusPgto, BILLING_VAZIO } from './abas/types';
import AbaGeral from './abas/AbaGeral';
import AbaModulos from './abas/AbaModulos';
import AbaUnidades from './abas/AbaUnidades';
import AbaMetricas from './abas/AbaMetricas';
import AbaFaturamento from './abas/AbaFaturamento';
import AbaPortais from './abas/AbaPortais';
import AbaContrato from './abas/AbaContrato';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

const COR_STATUS: Record<string, string> = {
  ativa: 'bg-green-500/20 text-green-400 border-green-500/30',
  trial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  suspensa: 'bg-red-500/20 text-red-400 border-red-500/30',
};
const COR_PLANO: Record<string, string> = {
  essencial: 'text-slate-300',
  pro: 'text-blue-400',
  enterprise: 'text-purple-400',
};

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

type Aba = 'geral' | 'modulos' | 'unidades' | 'faturamento' | 'portais' | 'contrato' | 'metricas';
const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: 'geral', label: 'Geral', icon: <Edit2 size={13}/> },
  { id: 'modulos', label: 'Módulos', icon: <Package size={13}/> },
  { id: 'unidades', label: 'Unidades', icon: <Building2 size={13}/> },
  { id: 'faturamento', label: 'Faturamento', icon: <DollarSign size={13}/> },
  { id: 'portais', label: 'Portais', icon: <Globe size={13}/> },
  { id: 'contrato', label: 'Contrato', icon: <PenLine size={13}/> },
  { id: 'metricas', label: 'Métricas', icon: <BarChart2 size={13}/> },
];

const STATUS_PGTO_CFG = {
  ativo:        { label: 'Em dia',         cor: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30',    icon: <CheckCircle2 size={10}/> },
  vencendo:     { label: 'Vence em breve', cor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Clock size={10}/> },
  inadimplente: { label: 'Vencido',        cor: 'bg-red-500/20 text-red-400 border-red-500/30',           icon: <AlertTriangle size={10}/> },
  sem_dados:    { label: 'Sem faturamento',cor: 'bg-slate-500/20 text-slate-400 border-slate-500/30',    icon: <XCircle size={10}/> },
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<Aba>('geral');
  const [atividade, setAtividade] = useState<{
    leads_mes: number; usuarios_ativos_7d: number;
    ultimos_logins: { nome: string; empresa: string; ultimo_acesso: string }[];
    por_empresa: { id: string; nome: string; status: string; total_usuarios: number; usuarios_ativos_7d: number; leads_mes: number; leads_total: number; ultimo_acesso: string | null }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [entrandoComoId, setEntrandoComoId] = useState<string | null>(null);

  const [modoLista, setModoLista] = useState<'empresas' | 'cobranca'>('empresas');
  const [busca, setBusca] = useState('');
  const [registrandoPgtoId, setRegistrandoPgtoId] = useState<string | null>(null);

  // Form nova empresa
  const [showNovaEmpresa, setShowNovaEmpresa] = useState(false);
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('');
  const [novaEmpresaCnpj, setNovaEmpresaCnpj] = useState('');
  const [novaEmpresaDiretorNome, setNovaEmpresaDiretorNome] = useState('');
  const [novaEmpresaDiretorEmail, setNovaEmpresaDiretorEmail] = useState('');
  const [novaEmpresaDemo, setNovaEmpresaDemo] = useState(false);
  const [novaEmpresaFeedback, setNovaEmpresaFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);

  const isAdmin = !authLoading && user && ADMIN_EMAILS.includes(user.email || '');

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => {
    if (token) carregarEmpresas();
  }, [token]);

  const headers = () => headersAuth(token);

  const carregarEmpresas = async () => {
    setLoading(true);
    const [resEmpresas, resAtividade, resBillings] = await Promise.all([
      fetch('/api/admin/empresas', { headers: headers() }),
      fetch('/api/admin/atividade', { headers: headers() }),
      supabase.from('clientes_wegrow').select('*'),
    ]);
    const empresasData = resEmpresas.ok ? await resEmpresas.json() : [];
    const billingMap = Object.fromEntries((resBillings.data || []).map((b: any) => [b.empresa_id, b]));
    setEmpresas(empresasData.map((e: any) => ({ ...e, billing: billingMap[e.id] ?? null })));
    if (resAtividade.ok) setAtividade(await resAtividade.json());
    setLoading(false);
    // mantém a empresa selecionada em sincronia com os dados recarregados
    setEmpresaSelecionada(prev => {
      if (!prev) return prev;
      const atualizada = empresasData.find((e: any) => e.id === prev.id);
      return atualizada ? { ...atualizada, billing: billingMap[atualizada.id] ?? null } : prev;
    });
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
      setNovaEmpresaNome(''); setNovaEmpresaCnpj(''); setNovaEmpresaDiretorNome(''); setNovaEmpresaDiretorEmail(''); setNovaEmpresaDemo(false);
      await carregarEmpresas();
      // já abre a empresa recém-criada no painel de abas — sem precisar caçar ela na lista
      setEmpresaSelecionada({ ...json, billing: null });
      setAbaAtiva('geral');
      setShowNovaEmpresa(false);
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

  const registrarPagamentoRapido = async (e: Empresa) => {
    setRegistrandoPgtoId(e.id);
    const atual = e.billing?.proximo_vencimento ?? new Date().toISOString().substring(0, 10);
    await supabase.from('clientes_wegrow').upsert(
      { ...BILLING_VAZIO(e.id), ...(e.billing ?? {}), empresa_id: e.id, proximo_vencimento: proximoMes(atual) },
      { onConflict: 'empresa_id' }
    );
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

  const empresasAtivas = empresas.filter(e => e.status !== 'suspensa');
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

  return (
    <div className="text-white p-4 md:p-8 pb-20">
      <div className="max-w-7xl mx-auto">

        {/* Título só aparece impresso/exportado — o resto do header fica escondido no print */}
        <div className="hidden print:block mb-8">
          <div className="text-xl font-black uppercase italic tracking-tighter">Wegrow · Visão geral</div>
          <p className="text-xs font-bold">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-black uppercase italic flex items-center gap-3">
              <ShieldAlert className="text-[#22C55E]" size={32}/> God Mode
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Painel de controle do sistema</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500 font-bold">{empresas.length} empresas</p>
              <p className="text-xs text-[#22C55E] font-black">
                {empresas.filter(e => e.status === 'ativa').length} ativas
              </p>
            </div>
            <button
              onClick={() => window.print()}
              title="Gerar apresentação (imprimir / salvar PDF) — só a Visão geral"
              className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 rounded-xl transition-colors"
            >
              <Printer size={14}/>
            </button>
            <Link
              href="/admin/prospeccao"
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all"
            >
              <Target size={14}/> Prospecção
            </Link>
            <Link
              href="/admin/indicadores"
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all"
            >
              <BarChart2 size={14}/> Indicadores
            </Link>
            <button
              onClick={() => setShowNovaEmpresa(true)}
              className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"
            >
              <Plus size={14}/> Nova Empresa
            </button>
          </div>
        </div>

        {/* Visão geral */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Empresas ativas</p>
            <p className="text-xl font-black text-white">{empresas.filter(e => e.status === 'ativa').length}</p>
          </div>
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Usuários ativos (7d)</p>
            <p className="text-xl font-black text-[#22C55E]">{atividade?.usuarios_ativos_7d ?? '—'}</p>
          </div>
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Leads criados (mês)</p>
            <p className="text-xl font-black text-white">{atividade?.leads_mes ?? '—'}</p>
          </div>
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Total de empresas</p>
            <p className="text-xl font-black text-white">{empresas.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          {/* Novas empresas por mês */}
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Activity size={12}/> Novas empresas por mês</p>
            {(() => {
              const hoje = new Date();
              const meses6 = Array.from({ length: 6 }).map((_, i) => {
                const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
                return { ano: d.getFullYear(), mes: d.getMonth(), label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` };
              });
              const porMes = meses6.map(m => ({
                ...m,
                count: empresas.filter(e => {
                  const d = new Date(e.created_at);
                  return d.getFullYear() === m.ano && d.getMonth() === m.mes;
                }).length,
              }));
              const max = Math.max(1, ...porMes.map(m => m.count));
              return (
                <div className="space-y-2">
                  {porMes.map((m, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase w-10 shrink-0">{m.label}</span>
                      <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[#22C55E] rounded-full transition-all" style={{ width: `${(m.count / max) * 100}%` }}/>
                      </div>
                      <span className="text-xs font-black text-white w-5 text-right shrink-0">{m.count}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Atividade recente */}
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Clock size={12}/> Atividade recente</p>
            {!atividade || atividade.ultimos_logins.length === 0 ? (
              <p className="text-slate-600 text-xs py-4 text-center">Sem logins recentes.</p>
            ) : (
              <div className="space-y-2.5">
                {atividade.ultimos_logins.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="text-white font-bold">{l.nome}</span>
                      <span className="text-slate-500"> · {l.empresa}</span>
                    </div>
                    <span className="text-slate-600 shrink-0">{tempoRelativo(l.ultimo_acesso)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Atividade por empresa ativa */}
        <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5 mb-6">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Building2 size={12}/> Atividade por empresa ativa</p>
          {!atividade ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-600"/></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                    <th className="text-left py-2 pr-3">Empresa</th>
                    <th className="text-right py-2 px-3">Usuários ativos (7d)</th>
                    <th className="text-right py-2 px-3">Leads (mês)</th>
                    <th className="text-right py-2 px-3">Leads (total)</th>
                    <th className="text-right py-2 pl-3">Último acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {atividade.por_empresa.filter(e => e.status === 'ativa').map(e => (
                    <tr key={e.id} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 pr-3 font-bold text-white truncate max-w-[200px]">{e.nome}</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <span className={e.usuarios_ativos_7d > 0 ? 'text-[#22C55E] font-bold' : 'text-slate-600'}>{e.usuarios_ativos_7d}</span>
                        <span className="text-slate-600"> / {e.total_usuarios}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300">{e.leads_mes}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">{e.leads_total}</td>
                      <td className="py-2.5 pl-3 text-right text-slate-500">{e.ultimo_acesso ? tempoRelativo(e.ultimo_acesso) : '—'}</td>
                    </tr>
                  ))}
                  {atividade.por_empresa.filter(e => e.status === 'ativa').length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-slate-600">Nenhuma empresa ativa.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 print:hidden">

          {/* Lista de Empresas */}
          <div className="lg:col-span-2 space-y-3">

            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1">
              <button onClick={() => setModoLista('empresas')} className={`flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${modoLista === 'empresas' ? 'bg-[#22C55E] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>Empresas</button>
              <button onClick={() => setModoLista('cobranca')} className={`flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${modoLista === 'cobranca' ? 'bg-[#22C55E] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>Cobrança</button>
            </div>

            <div className="flex items-center bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2 gap-2">
              <Search size={14} className="text-slate-500"/>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa..." className="flex-1 bg-transparent outline-none text-sm text-white"/>
            </div>

            {modoLista === 'cobranca' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#0F172A] border border-white/5 rounded-xl p-3">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">MRR</p>
                    <p className="text-sm font-black text-[#22C55E]">R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-[#0F172A] border border-white/5 rounded-xl p-3">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">ARPU</p>
                    <p className="text-sm font-black text-white">R$ {arpu.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-[#0F172A] border border-white/5 rounded-xl p-3">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Lucro líq.</p>
                    <p className={`text-sm font-black ${lucroLiquido >= 0 ? 'text-[#22C55E]' : 'text-red-400'}`}>R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                {vencendoBreve.length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex items-start gap-2">
                    <Clock size={12} className="text-yellow-400 shrink-0 mt-0.5"/>
                    <p className="text-slate-300 text-[11px]">{vencendoBreve.map(c => `${c.nome} (${diasParaVencer(c.billing?.proximo_vencimento ?? null)}d)`).join(' · ')}</p>
                  </div>
                )}
                {inadimplentes.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={12} className="text-red-400 shrink-0 mt-0.5"/>
                    <p className="text-slate-300 text-[11px]">{inadimplentes.map(c => c.nome).join(' · ')}</p>
                  </div>
                )}
                {semDados.length > 0 && (
                  <p className="text-slate-500 text-[10px] px-1">{semDados.map(c => c.nome).join(', ')} — sem dados de faturamento.</p>
                )}
              </>
            )}

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-white/[0.03] border border-white/5 rounded-2xl animate-pulse"/>)}</div>
            ) : modoLista === 'empresas' ? (
              listaFiltrada.map(e => (
                <button
                  key={e.id}
                  onClick={() => abrirEmpresa(e)}
                  className={`w-full text-left bg-[#0F172A] border rounded-2xl p-4 transition-all hover:border-white/20 flex items-center justify-between gap-3 ${empresaSelecionada?.id === e.id ? 'border-[#22C55E]/50 bg-[#22C55E]/5' : 'border-white/5'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-slate-400"/>
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm truncate">{e.nome}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-black uppercase ${COR_PLANO[e.plano]}`}>{e.plano}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${COR_STATUS[e.status]}`}>{e.status}</span>
                        {Boolean((e.modulos as any)?.demo) && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-dashed border-purple-400/40 text-purple-300 bg-purple-500/10">Demo</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-500 text-[10px] flex items-center gap-1"><Users size={10}/>{e.total_usuarios}</span>
                    <ChevronRight size={14} className="text-slate-600"/>
                  </div>
                </button>
              ))
            ) : (
              listaFiltrada.map(e => {
                const sp = statusPgto(e.billing);
                const cfg = STATUS_PGTO_CFG[sp];
                const dias = diasParaVencer(e.billing?.proximo_vencimento ?? null);
                return (
                  <div key={e.id} className={`bg-[#0F172A] border rounded-2xl p-4 transition-all ${sp === 'vencendo' ? 'border-yellow-500/30' : sp === 'inadimplente' ? 'border-red-500/30' : 'border-white/5'}`}>
                    <button onClick={() => abrirEmpresa(e, 'faturamento')} className="w-full text-left mb-3">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h3 className="font-black text-white text-sm truncate">{e.nome}</h3>
                        <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.cor}`}>{cfg.icon} {cfg.label}</span>
                        {dias !== null && dias >= 0 && dias <= 7 && <span className="text-[9px] font-black text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full uppercase">Vence em {dias}d</span>}
                        {dias !== null && dias < 0 && <span className="text-[9px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full uppercase">Vencido há {Math.abs(dias)}d</span>}
                      </div>
                      <p className="text-[11px] text-slate-500">Vence {fmtData(e.billing?.proximo_vencimento ?? null)} · R$ {(e.billing?.valor_mensal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</p>
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => registrarPagamentoRapido(e)} disabled={registrandoPgtoId === e.id} className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-1.5 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all disabled:opacity-50">
                        {registrandoPgtoId === e.id ? <Loader2 size={10} className="animate-spin"/> : <CheckCircle2 size={10}/>} Pgto recebido
                      </button>
                      {e.billing?.whatsapp && (
                        <a href={`https://wa.me/55${e.billing.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá${e.billing.contato ? ' ' + e.billing.contato : ''}! Segue o Pix para renovação da assinatura WeGrow — R$ ${(e.billing.valor_mensal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês. Vencimento: ${fmtData(e.billing.proximo_vencimento)}.`)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white px-3 py-1.5 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all">
                          <MessageCircle size={10}/> Cobrar
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Painel da empresa selecionada */}
          {empresaSelecionada && (
            <div className="lg:col-span-3">
              <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                  <h2 className="font-black uppercase text-sm flex items-center gap-2">
                    <Edit2 size={14} className="text-[#22C55E]"/> {empresaSelecionada.nome}
                    {Boolean((empresaSelecionada.modulos as any)?.demo) && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-dashed border-purple-400/40 text-purple-300 bg-purple-500/10">Demo</span>
                    )}
                  </h2>
                  <button onClick={() => entrarComoEmpresa(empresaSelecionada.id)} disabled={entrandoComoId === empresaSelecionada.id}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all disabled:opacity-50">
                    {entrandoComoId === empresaSelecionada.id ? <Loader2 size={12} className="animate-spin"/> : <LogIn size={12}/>} Entrar como
                  </button>
                </div>

                <div className="flex border-b border-white/10 overflow-x-auto">
                  {ABAS.map(a => (
                    <button key={a.id} onClick={() => setAbaAtiva(a.id)}
                      className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap ${abaAtiva === a.id ? 'border-[#22C55E] text-[#22C55E]' : 'border-transparent text-slate-500 hover:text-white'}`}>
                      {a.icon} {a.label}
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {abaAtiva === 'geral' && <AbaGeral empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
                  {abaAtiva === 'modulos' && <AbaModulos empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
                  {abaAtiva === 'unidades' && <AbaUnidades empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
                  {abaAtiva === 'faturamento' && <AbaFaturamento empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
                  {abaAtiva === 'portais' && <AbaPortais empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
                  {abaAtiva === 'contrato' && <AbaContrato empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
                  {abaAtiva === 'metricas' && <AbaMetricas empresa={empresaSelecionada} token={token} onAtualizado={carregarEmpresas}/>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nova Empresa */}
      {showNovaEmpresa && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-black uppercase text-sm">Nova Empresa</h3>
              <button onClick={() => { setShowNovaEmpresa(false); setNovaEmpresaFeedback(null); }} className="text-slate-500 hover:text-white"><X size={16}/></button>
            </div>
            <form onSubmit={criarEmpresa} className="space-y-3">
              <input required placeholder="Nome da empresa *" value={novaEmpresaNome} onChange={e => setNovaEmpresaNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
              <input placeholder="CNPJ" value={novaEmpresaCnpj} onChange={e => setNovaEmpresaCnpj(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
              <div className="border-t border-white/10 pt-3 mt-1">
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2">Primeiro diretor (obrigatório — sem isso a empresa fica invisível)</p>
                <input required placeholder="Nome do diretor *" value={novaEmpresaDiretorNome} onChange={e => setNovaEmpresaDiretorNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] mb-3"/>
                <input required type="email" placeholder="E-mail do diretor *" value={novaEmpresaDiretorEmail} onChange={e => setNovaEmpresaDiretorEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
              </div>
              <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer">
                <input type="checkbox" checked={novaEmpresaDemo} onChange={e => setNovaEmpresaDemo(e.target.checked)} className="w-4 h-4 accent-purple-400"/>
                <span className="text-[11px] font-bold text-slate-400">Empresa demo <span className="text-slate-600 font-normal">(dado fake, uso comercial — não é cliente pagante)</span></span>
              </label>
              {novaEmpresaFeedback && (
                <div className={`text-xs font-bold p-3 rounded-xl ${novaEmpresaFeedback.tipo === 'sucesso' ? 'bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {novaEmpresaFeedback.msg}
                </div>
              )}
              <button type="submit" disabled={saving} className="w-full bg-[#22C55E] text-[#0B1120] py-3 rounded-xl font-black uppercase text-xs">
                {saving ? 'Criando...' : 'Criar Empresa'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
