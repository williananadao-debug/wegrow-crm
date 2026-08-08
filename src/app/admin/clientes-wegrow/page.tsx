"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Edit2, X, Loader2, MessageCircle, CheckCircle2,
  AlertTriangle, XCircle, DollarSign, Calendar, Phone,
  User, Save, RefreshCw, TrendingUp, Clock, Package,
  ArrowLeft, ShieldAlert, Globe, PenLine, Plus, Trash2,
  Eye, EyeOff, Copy, ExternalLink,
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

const MODULO_LABELS: Record<string, string> = {
  cdl: 'CDL', opec: 'Opec', ia: 'IA', financeiro: 'Financeiro', whatsapp: 'WhatsApp', nexus: 'Nexus',
  venda_rapida: 'Venda Rápida',
};
// "crm" é o macro-toggle do produto de pipeline/vendas inteiro. Ausente no JSON conta
// como ligado (empresas criadas antes disso existir não podem perder o menu no deploy).
const CRM_SUBMODULOS = ['cdl', 'opec', 'ia', 'financeiro', 'whatsapp'] as const;

type Empresa = { id: string; nome: string; plano: string; status: string; modulos: Record<string, any>; created_at: string; };
type Billing = { empresa_id: string; valor_mensal: number; proximo_vencimento: string | null; whatsapp: string | null; contato: string | null; observacao: string | null; };
type ClienteView = Empresa & { billing: Billing | null };
type Portal = { id: string; slug: string; nome_portal: string; ativo: boolean; cor_primaria: string; };

const BILLING_VAZIO = (empresa_id: string): Billing => ({ empresa_id, valor_mensal: 0, proximo_vencimento: null, whatsapp: null, contato: null, observacao: null });
const EMPTY_BILLING = { valor_mensal: '', proximo_vencimento: '', whatsapp: '', contato: '', observacao: '' };
const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://www.wegrow.app.br';

function diasParaVencer(d: string | null) { if (!d) return null; return Math.floor((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000); }
function fmtData(d: string | null) { if (!d) return '—'; return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); }
function proximoMes(d: string) { const dt = new Date(d + 'T00:00:00'); dt.setMonth(dt.getMonth() + 1); return dt.toISOString().substring(0, 10); }
function statusPgto(b: Billing | null): 'sem_dados' | 'ativo' | 'vencendo' | 'inadimplente' {
  if (!b || !b.proximo_vencimento) return 'sem_dados';
  const dias = diasParaVencer(b.proximo_vencimento);
  if (dias === null) return 'sem_dados';
  if (dias < 0) return 'inadimplente';
  if (dias <= 7) return 'vencendo';
  return 'ativo';
}

const STATUS_CFG = {
  ativo:        { label: 'Em dia',         cor: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30',    icon: <CheckCircle2 size={10}/> },
  vencendo:     { label: 'Vence em breve', cor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Clock size={10}/> },
  inadimplente: { label: 'Vencido',        cor: 'bg-red-500/20 text-red-400 border-red-500/30',           icon: <AlertTriangle size={10}/> },
  sem_dados:    { label: 'Sem faturamento',cor: 'bg-slate-500/20 text-slate-400 border-slate-500/30',    icon: <XCircle size={10}/> },
};

type Aba = 'faturamento' | 'modulos' | 'portais';

export default function ClientesWeGrowPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [clientes, setClientes] = useState<ClienteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [token, setToken] = useState('');

  // Modal
  const [editando, setEditando] = useState<ClienteView | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<Aba>('faturamento');

  // Aba Faturamento
  const [form, setForm] = useState(EMPTY_BILLING);
  const [saving, setSaving] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [registrandoPgto, setRegistrandoPgto] = useState<string | null>(null);

  // Aba Módulos
  const [modulosEdit, setModulosEdit] = useState<Record<string, boolean>>({});
  const [savingModulos, setSavingModulos] = useState(false);

  // Aba Portais
  const [portais, setPortais] = useState<Portal[]>([]);
  const [loadingPortais, setLoadingPortais] = useState(false);
  const [novoSlug, setNovoSlug] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [criandoPortal, setCriandoPortal] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token && isAdmin) carregar(); }, [token, isAdmin]);

  const carregar = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/empresas', { headers: { Authorization: `Bearer ${token}` } });
    const empresas: Empresa[] = res.ok ? await res.json() : [];
    const { data: billings, error } = await supabase.from('clientes_wegrow').select('*');
    if (error?.code === '42P01') { setSemTabela(true); setLoading(false); return; }
    setSemTabela(false);
    const billingMap = Object.fromEntries((billings || []).map((b: Billing) => [b.empresa_id, b]));
    const merged: ClienteView[] = empresas
      .filter(e => e.status !== 'suspensa')
      .map(e => ({ ...e, billing: billingMap[e.id] ?? null }))
      .sort((a, b) => {
        const da = diasParaVencer(a.billing?.proximo_vencimento ?? null);
        const db = diasParaVencer(b.billing?.proximo_vencimento ?? null);
        if (da === null && db === null) return 0;
        if (da === null) return 1; if (db === null) return -1;
        return da - db;
      });
    setClientes(merged);
    setLoading(false);
  };

  const abrirEdicao = (c: ClienteView) => {
    setEditando(c);
    setAbaAtiva('faturamento');
    setErroSalvar(null);
    setModulosEdit(c.modulos || {});
    setPortais([]);
    setNovoSlug(''); setNovoNome('');
    setForm({
      valor_mensal: String(c.billing?.valor_mensal ?? ''),
      proximo_vencimento: c.billing?.proximo_vencimento ?? '',
      whatsapp: c.billing?.whatsapp ?? '',
      contato: c.billing?.contato ?? '',
      observacao: c.billing?.observacao ?? '',
    });
  };

  const carregarPortais = async (empresa_id: string) => {
    setLoadingPortais(true);
    const res = await fetch(`/api/admin/portais?empresa_id=${empresa_id}`, { headers: { Authorization: `Bearer ${token}` } });
    setPortais(res.ok ? await res.json() : []);
    setLoadingPortais(false);
  };

  const mudarAba = (aba: Aba) => {
    setAbaAtiva(aba);
    if (aba === 'portais' && editando) carregarPortais(editando.id);
  };

  // Faturamento
  const salvar = async () => {
    if (!editando) return;
    setSaving(true); setErroSalvar(null);
    const payload: Billing = {
      empresa_id: editando.id,
      valor_mensal: parseFloat(form.valor_mensal) || 0,
      proximo_vencimento: form.proximo_vencimento || null,
      whatsapp: form.whatsapp || null,
      contato: form.contato || null,
      observacao: form.observacao || null,
    };
    const { error } = await supabase.from('clientes_wegrow').upsert(payload, { onConflict: 'empresa_id' });
    setSaving(false);
    if (error) { setErroSalvar(error.message); return; }
    setEditando(null); carregar();
  };

  const registrarPagamento = async (c: ClienteView) => {
    setRegistrandoPgto(c.id);
    const atual = c.billing?.proximo_vencimento ?? new Date().toISOString().substring(0, 10);
    await supabase.from('clientes_wegrow').upsert(
      { ...BILLING_VAZIO(c.id), ...(c.billing ?? {}), empresa_id: c.id, proximo_vencimento: proximoMes(atual) },
      { onConflict: 'empresa_id' }
    );
    setRegistrandoPgto(null); carregar();
  };

  // Módulos
  const toggleModulo = async (modulo: string, valorExplicito?: boolean) => {
    if (!editando) return;
    const valor = valorExplicito !== undefined ? valorExplicito : !modulosEdit[modulo];
    const novo = { ...modulosEdit, [modulo]: valor };
    setModulosEdit(novo); setSavingModulos(true);
    await fetch('/api/admin/empresas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: editando.id, modulos: { ...editando.modulos, ...novo } }),
    });
    setSavingModulos(false); carregar();
  };

  // Portais
  const criarPortal = async () => {
    if (!editando || !novoSlug.trim() || !novoNome.trim()) return;
    setCriandoPortal(true);
    await fetch('/api/admin/portais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ empresa_id: editando.id, slug: novoSlug.trim(), nome_portal: novoNome.trim(), cor_primaria: '#22C55E', logo_texto: 'W', tipos_cadastro: [{ nome: 'Padrão', desc: '', valor: 0 }], segmentos: [], etapas: ['Recebido', 'Em análise', 'Proposta enviada', 'Em negociação', 'Concluído'], ativo: true }),
    });
    setCriandoPortal(false); setNovoSlug(''); setNovoNome('');
    carregarPortais(editando.id);
  };

  const togglePortal = async (p: Portal) => {
    await fetch('/api/admin/portais', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: p.id, ativo: !p.ativo }),
    });
    if (editando) carregarPortais(editando.id);
  };

  const excluirPortal = async (id: string) => {
    if (!confirm('Excluir este portal?')) return;
    await fetch(`/api/admin/portais?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (editando) carregarPortais(editando.id);
  };

  const copiarLink = (slug: string) => {
    navigator.clipboard.writeText(`${BASE_URL}/p/${slug}`);
    setCopiado(slug); setTimeout(() => setCopiado(null), 2000);
  };

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert size={40} className="text-red-500 mx-auto mb-3"/><p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p></div>
    </div>
  );

  const mrr = clientes.reduce((s, c) => s + (c.billing?.valor_mensal ?? 0), 0);
  const vencendoBreve = clientes.filter(c => statusPgto(c.billing) === 'vencendo');
  const inadimplentes = clientes.filter(c => statusPgto(c.billing) === 'inadimplente');
  const semDados = clientes.filter(c => statusPgto(c.billing) === 'sem_dados');

  const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'faturamento', label: 'Faturamento', icon: <DollarSign size={13}/> },
    { id: 'modulos',     label: 'Módulos',     icon: <Package size={13}/> },
    { id: 'portais',     label: 'Portais',     icon: <Globe size={13}/> },
  ];

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <ArrowLeft size={16} className="text-slate-400"/>
            </Link>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                <TrendingUp size={22} className="text-[#22C55E]"/> Assinaturas WeGrow
              </h1>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Clientes ativos · painel interno</p>
            </div>
          </div>
          <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
            <RefreshCw size={16} className="text-slate-400"/>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'MRR', valor: `R$ ${mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, cor: 'text-[#22C55E]' },
            { label: 'Clientes', valor: String(clientes.length), cor: 'text-white' },
            { label: 'Vencem em 7d', valor: String(vencendoBreve.length), cor: vencendoBreve.length > 0 ? 'text-yellow-400' : 'text-white' },
            { label: 'Vencidos', valor: String(inadimplentes.length), cor: inadimplentes.length > 0 ? 'text-red-400' : 'text-white' },
          ].map((k, i) => (
            <div key={i} className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{k.label}</p>
              <p className={`text-2xl font-black ${k.cor}`}>{k.valor}</p>
            </div>
          ))}
        </div>

        {vencendoBreve.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <Clock size={14} className="text-yellow-400 shrink-0 mt-0.5"/>
            <div>
              <p className="text-yellow-400 font-black text-xs uppercase tracking-widest mb-0.5">Vencimentos próximos</p>
              <p className="text-slate-300 text-xs">{vencendoBreve.map(c => `${c.nome} (${diasParaVencer(c.billing?.proximo_vencimento ?? null)}d)`).join(' · ')}</p>
            </div>
          </div>
        )}
        {inadimplentes.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5"/>
            <div>
              <p className="text-red-400 font-black text-xs uppercase tracking-widest mb-0.5">Pagamento vencido</p>
              <p className="text-slate-300 text-xs">{inadimplentes.map(c => c.nome).join(' · ')}</p>
            </div>
          </div>
        )}
        {semDados.length > 0 && (
          <div className="bg-slate-500/10 border border-slate-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <XCircle size={14} className="text-slate-500 shrink-0 mt-0.5"/>
            <p className="text-slate-500 text-xs"><span className="font-black">{semDados.map(c => c.nome).join(', ')}</span> — sem dados de faturamento.</p>
          </div>
        )}

        {semTabela && (
          <div className="bg-[#0F172A] border border-yellow-500/20 rounded-3xl p-8 mb-6">
            <p className="text-yellow-400 font-black text-sm uppercase tracking-widest mb-4">Execute no Supabase</p>
            <pre className="bg-black/40 rounded-xl p-4 text-[11px] text-green-400 font-mono overflow-x-auto">{`create table clientes_wegrow (\n  empresa_id uuid primary key,\n  valor_mensal numeric default 0,\n  proximo_vencimento date,\n  whatsapp text,\n  contato text,\n  observacao text\n);`}</pre>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600"/></div>
        ) : (
          <div className="space-y-3">
            {clientes.map(c => {
              const sp = statusPgto(c.billing);
              const cfg = STATUS_CFG[sp];
              const dias = diasParaVencer(c.billing?.proximo_vencimento ?? null);
              const modulosAtivos = Object.entries(c.modulos || {})
                .filter(([k, v]) => v === true && MODULO_LABELS[k])
                .map(([k]) => MODULO_LABELS[k]);

              return (
                <div key={c.id} className={`bg-[#0F172A] border rounded-2xl p-5 transition-all ${sp === 'vencendo' ? 'border-yellow-500/30' : sp === 'inadimplente' ? 'border-red-500/30' : 'border-white/5'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="font-black text-white text-sm uppercase tracking-tight">{c.nome}</h3>
                        <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.cor}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        {dias !== null && dias >= 0 && dias <= 7 && <span className="text-[9px] font-black text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full uppercase">Vence em {dias}d</span>}
                        {dias !== null && dias < 0 && <span className="text-[9px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full uppercase animate-pulse">Vencido há {Math.abs(dias)}d</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-3">
                        {c.billing?.contato && <span className="flex items-center gap-1"><User size={10}/> {c.billing.contato}</span>}
                        {c.billing?.whatsapp && <span className="flex items-center gap-1"><Phone size={10}/> {c.billing.whatsapp}</span>}
                        <span className="flex items-center gap-1"><Calendar size={10}/> Vence {fmtData(c.billing?.proximo_vencimento ?? null)}</span>
                        <span className="flex items-center gap-1"><DollarSign size={10}/> R$ {(c.billing?.valor_mensal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</span>
                      </div>
                      {modulosAtivos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {modulosAtivos.map(m => (
                            <span key={m} className="text-[9px] font-black uppercase tracking-widest bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#22C55E] px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Package size={8}/> {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => registrarPagamento(c)} disabled={registrandoPgto === c.id} className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-50">
                        {registrandoPgto === c.id ? <Loader2 size={11} className="animate-spin"/> : <CheckCircle2 size={11}/>} Pgto recebido
                      </button>
                      {c.billing?.whatsapp && (
                        <a href={`https://wa.me/55${c.billing.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá${c.billing.contato ? ' ' + c.billing.contato : ''}! Segue o Pix para renovação da assinatura WeGrow — R$ ${(c.billing.valor_mensal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês. Vencimento: ${fmtData(c.billing.proximo_vencimento)}.`)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
                          <MessageCircle size={11}/> Cobrar
                        </a>
                      )}
                      <button onClick={() => abrirEdicao(c)} className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white p-2 rounded-xl transition-all">
                        <Edit2 size={12}/>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {editando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
              <div>
                <h2 className="font-black text-white uppercase italic tracking-tight">{editando.nome}</h2>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">Painel admin</p>
              </div>
              <button onClick={() => setEditando(null)} className="text-slate-500 hover:text-white transition-colors"><X size={18}/></button>
            </div>

            {/* Abas */}
            <div className="flex border-b border-white/10 flex-shrink-0">
              {ABAS.map(a => (
                <button key={a.id} onClick={() => mudarAba(a.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${abaAtiva === a.id ? 'border-[#22C55E] text-[#22C55E]' : 'border-transparent text-slate-500 hover:text-white'}`}>
                  {a.icon} {a.label}
                </button>
              ))}
            </div>

            {/* Conteúdo das abas */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* FATURAMENTO */}
              {abaAtiva === 'faturamento' && (
                <>
                  {erroSalvar && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                      <p className="text-red-400 font-black text-xs uppercase tracking-widest mb-2">Erro ao salvar — execute no Supabase:</p>
                      <pre className="text-[10px] text-green-400 font-mono bg-black/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{`alter table clientes_wegrow disable row level security;`}</pre>
                      <p className="text-slate-500 text-[10px] mt-2 font-mono">{erroSalvar}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Valor mensal (R$)</label>
                      <input type="number" value={form.valor_mensal} onChange={e => setForm(f => ({ ...f, valor_mensal: e.target.value }))} placeholder="497" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Próx. vencimento</label>
                      <input type="date" value={form.proximo_vencimento} onChange={e => setForm(f => ({ ...f, proximo_vencimento: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Contato</label>
                      <input value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} placeholder="Nome" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">WhatsApp</label>
                      <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="(47) 99999-9999" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Observação</label>
                    <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} placeholder="Notas internas..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors resize-none placeholder:text-slate-600"/>
                  </div>
                </>
              )}

              {/* MÓDULOS */}
              {abaAtiva === 'modulos' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400 text-xs">Clique para ativar ou desativar. Salva em tempo real.</p>
                    {savingModulos && <Loader2 size={14} className="animate-spin text-slate-500"/>}
                  </div>

                  <div>
                    {(() => {
                      const crmAtivo = modulosEdit.crm !== false;
                      return (
                        <button type="button" onClick={() => toggleModulo('crm', !crmAtivo)}
                          className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${crmAtivo ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white hover:border-white/20'}`}>
                          <Package size={12}/> CRM
                          {crmAtivo && <CheckCircle2 size={12} className="ml-auto"/>}
                        </button>
                      );
                    })()}
                    <div className={`grid grid-cols-2 gap-2 mt-2 ml-2 pl-3 border-l border-white/10 transition-opacity ${modulosEdit.crm === false ? 'opacity-40 pointer-events-none' : ''}`}>
                      {CRM_SUBMODULOS.map(mod => {
                        const ativo = Boolean(modulosEdit[mod]);
                        return (
                          <button key={mod} type="button" onClick={() => toggleModulo(mod)}
                            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${ativo ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white hover:border-white/20'}`}>
                            <Package size={12}/> {MODULO_LABELS[mod]}
                            {ativo && <CheckCircle2 size={12} className="ml-auto"/>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <button type="button" onClick={() => toggleModulo('nexus')}
                      className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${Boolean(modulosEdit.nexus) ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white hover:border-white/20'}`}>
                      <Package size={12}/> Nexus
                      {Boolean(modulosEdit.nexus) && <CheckCircle2 size={12} className="ml-auto"/>}
                    </button>
                  </div>

                  <div>
                    <button type="button" onClick={() => toggleModulo('venda_rapida')}
                      className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${Boolean(modulosEdit.venda_rapida) ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white hover:border-white/20'}`}>
                      <Package size={12}/> Venda Rápida
                      {Boolean(modulosEdit.venda_rapida) && <CheckCircle2 size={12} className="ml-auto"/>}
                    </button>
                  </div>
                </div>
              )}

              {/* PORTAIS */}
              {abaAtiva === 'portais' && (
                <div className="space-y-4">
                  {loadingPortais ? (
                    <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-600"/></div>
                  ) : (
                    <>
                      {portais.length === 0 && <p className="text-slate-500 text-xs text-center py-4">Nenhum portal criado ainda.</p>}
                      {portais.map(p => (
                        <div key={p.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[#0B1120] font-black text-xs flex-shrink-0" style={{ background: p.cor_primaria }}>{p.nome_portal?.[0]?.toUpperCase() || 'P'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-black truncate">{p.nome_portal}</p>
                            <p className="text-slate-500 text-[10px] font-mono">/p/{p.slug}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => copiarLink(p.slug)} className="p-1.5 text-slate-500 hover:text-white transition-colors" title="Copiar link">
                              {copiado === p.slug ? <CheckCircle2 size={14} className="text-green-400"/> : <Copy size={14}/>}
                            </button>
                            <a href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-500 hover:text-white transition-colors"><ExternalLink size={14}/></a>
                            <button onClick={() => togglePortal(p)} className={`px-2 py-1 rounded text-[9px] font-black uppercase ${p.ativo ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-slate-500'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</button>
                            <button onClick={() => excluirPortal(p.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={14}/></button>
                          </div>
                        </div>
                      ))}

                      <div className="border-t border-white/5 pt-4 space-y-3">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Criar novo portal</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do portal" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
                          <input value={novoSlug} onChange={e => setNovoSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="slug-unico" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
                        </div>
                        <button onClick={criarPortal} disabled={criandoPortal || !novoSlug.trim() || !novoNome.trim()} className="w-full bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                          {criandoPortal ? <Loader2 size={13} className="animate-spin"/> : <Plus size={13}/>}
                          Criar Portal
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button onClick={() => setEditando(null)} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                Fechar
              </button>
              {abaAtiva === 'faturamento' && (
                <button onClick={salvar} disabled={saving} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-[#22C55E] text-[#0B1120] hover:bg-[#16A34A] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
