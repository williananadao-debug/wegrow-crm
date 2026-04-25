"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Plus, Edit2, X, Loader2, MessageCircle, CheckCircle2,
  AlertTriangle, XCircle, DollarSign, Calendar, Phone,
  User, Building2, Save, Trash2, RefreshCw, TrendingUp,
  Clock, Package
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

const MODULOS_OPCOES = ['Essencial CDL', 'Add-on WhatsApp', 'Add-on Financeiro'];

const STATUS_CONFIG: Record<string, { label: string; cor: string; icon: React.ReactNode }> = {
  ativo:        { label: 'Ativo',        cor: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30',       icon: <CheckCircle2 size={10}/> },
  trial:        { label: 'Trial',        cor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',    icon: <Clock size={10}/> },
  inadimplente: { label: 'Inadimplente', cor: 'bg-red-500/20 text-red-400 border-red-500/30',             icon: <AlertTriangle size={10}/> },
  cancelado:    { label: 'Cancelado',    cor: 'bg-slate-500/20 text-slate-400 border-slate-500/30',       icon: <XCircle size={10}/> },
};

type Cliente = {
  id: string;
  nome: string;
  contato: string | null;
  whatsapp: string | null;
  email: string | null;
  modulos: string[];
  valor_mensal: number;
  status: string;
  data_inicio: string | null;
  proximo_vencimento: string | null;
  observacao: string | null;
  created_at: string;
};

const EMPTY_FORM = {
  nome: '', contato: '', whatsapp: '', email: '',
  modulos: [] as string[], valor_mensal: '', status: 'ativo',
  data_inicio: '', proximo_vencimento: '', observacao: '',
};

function fmtData(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function diasParaVencer(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000);
}

function proximoMes(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  dt.setMonth(dt.getMonth() + 1);
  return dt.toISOString().substring(0, 10);
}

export default function ClientesWeGrowPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [registrandoPgto, setRegistrandoPgto] = useState<string | null>(null);

  useEffect(() => { if (isAdmin) carregar(); }, [isAdmin]);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes_wegrow')
      .select('*')
      .order('proximo_vencimento', { ascending: true });

    if (error?.code === '42P01') { setSemTabela(true); setLoading(false); return; }
    setClientes((data || []) as Cliente[]);
    setLoading(false);
  };

  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...EMPTY_FORM, data_inicio: new Date().toISOString().substring(0, 10) });
    setModalAberto(true);
  };

  const abrirEdicao = (c: Cliente) => {
    setEditando(c);
    setForm({
      nome: c.nome, contato: c.contato || '', whatsapp: c.whatsapp || '',
      email: c.email || '', modulos: c.modulos || [], valor_mensal: String(c.valor_mensal),
      status: c.status, data_inicio: c.data_inicio || '', proximo_vencimento: c.proximo_vencimento || '',
      observacao: c.observacao || '',
    });
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    const payload = {
      nome: form.nome.trim(), contato: form.contato || null, whatsapp: form.whatsapp || null,
      email: form.email || null, modulos: form.modulos, valor_mensal: parseFloat(form.valor_mensal) || 0,
      status: form.status, data_inicio: form.data_inicio || null,
      proximo_vencimento: form.proximo_vencimento || null, observacao: form.observacao || null,
    };
    if (editando) {
      await supabase.from('clientes_wegrow').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('clientes_wegrow').insert(payload);
    }
    setSaving(false);
    setModalAberto(false);
    carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este cliente?')) return;
    await supabase.from('clientes_wegrow').delete().eq('id', id);
    carregar();
  };

  const registrarPagamento = async (c: Cliente) => {
    setRegistrandoPgto(c.id);
    const novoVenc = c.proximo_vencimento ? proximoMes(c.proximo_vencimento) : proximoMes(new Date().toISOString().substring(0, 10));
    await supabase.from('clientes_wegrow').update({ status: 'ativo', proximo_vencimento: novoVenc }).eq('id', c.id);
    setRegistrandoPgto(null);
    carregar();
  };

  const toggleModulo = (m: string) => {
    setForm(f => ({
      ...f,
      modulos: f.modulos.includes(m) ? f.modulos.filter(x => x !== m) : [...f.modulos, m],
    }));
  };

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p>
    </div>
  );

  const mrr = clientes.filter(c => c.status === 'ativo' || c.status === 'trial').reduce((s, c) => s + c.valor_mensal, 0);
  const ativos = clientes.filter(c => c.status === 'ativo').length;
  const vencendoEm7 = clientes.filter(c => { const d = diasParaVencer(c.proximo_vencimento); return d !== null && d <= 7 && d >= 0 && c.status !== 'cancelado'; });
  const inadimplentes = clientes.filter(c => c.status === 'inadimplente').length;

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-sm">W</div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter">Clientes WeGrow</h1>
            </div>
            <p className="text-slate-500 text-xs uppercase tracking-widest font-bold ml-13">Assinaturas ativas · Painel interno</p>
          </div>
          <div className="flex gap-2">
            <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <RefreshCw size={16} className="text-slate-400"/>
            </button>
            <button onClick={abrirNovo} className="flex items-center gap-2 bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] px-4 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest transition-all">
              <Plus size={14}/> Novo Cliente
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'MRR', valor: `R$ ${mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, cor: 'text-[#22C55E]', icon: <TrendingUp size={16} className="text-[#22C55E]"/> },
            { label: 'Ativos', valor: String(ativos), cor: 'text-white', icon: <CheckCircle2 size={16} className="text-[#22C55E]"/> },
            { label: 'Vencem em 7d', valor: String(vencendoEm7.length), cor: vencendoEm7.length > 0 ? 'text-yellow-400' : 'text-white', icon: <Clock size={16} className="text-yellow-400"/> },
            { label: 'Inadimplentes', valor: String(inadimplentes), cor: inadimplentes > 0 ? 'text-red-400' : 'text-white', icon: <AlertTriangle size={16} className="text-red-400"/> },
          ].map((k, i) => (
            <div key={i} className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">{k.icon}<p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{k.label}</p></div>
              <p className={`text-2xl font-black ${k.cor}`}>{k.valor}</p>
            </div>
          ))}
        </div>

        {/* Alerta vencimentos */}
        {vencendoEm7.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5"/>
            <div>
              <p className="text-yellow-400 font-black text-xs uppercase tracking-widest mb-1">Vencimentos próximos</p>
              <p className="text-slate-300 text-xs">{vencendoEm7.map(c => `${c.nome} (${diasParaVencer(c.proximo_vencimento)}d)`).join(' · ')}</p>
            </div>
          </div>
        )}

        {/* Setup sem tabela */}
        {semTabela && (
          <div className="bg-[#0F172A] border border-yellow-500/20 rounded-3xl p-8">
            <p className="text-yellow-400 font-black text-sm uppercase tracking-widest mb-4">Tabela não encontrada no Supabase</p>
            <p className="text-slate-400 text-sm mb-4">Execute o SQL abaixo no painel do Supabase para criar a tabela:</p>
            <pre className="bg-black/40 rounded-xl p-4 text-[11px] text-green-400 font-mono overflow-x-auto">{`create table clientes_wegrow (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  contato text,
  whatsapp text,
  email text,
  modulos text[] default '{}',
  valor_mensal numeric not null default 0,
  status text not null default 'ativo',
  data_inicio date,
  proximo_vencimento date,
  observacao text,
  created_at timestamptz default now()
);`}</pre>
          </div>
        )}

        {/* Lista de clientes */}
        {!semTabela && (
          loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-slate-600"/>
            </div>
          ) : clientes.length === 0 ? (
            <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-12 text-center">
              <Building2 size={32} className="text-slate-700 mx-auto mb-3"/>
              <p className="text-slate-500 text-sm">Nenhum cliente cadastrado ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clientes.map(c => {
                const dias = diasParaVencer(c.proximo_vencimento);
                const urgente = dias !== null && dias <= 7 && dias >= 0;
                const vencido = dias !== null && dias < 0;
                const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.ativo;

                return (
                  <div key={c.id} className={`bg-[#0F172A] border rounded-2xl p-5 transition-all ${urgente ? 'border-yellow-500/30' : vencido ? 'border-red-500/20' : 'border-white/5'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <h3 className="font-black text-white text-sm uppercase tracking-tight">{c.nome}</h3>
                          <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.cor}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                          {urgente && <span className="text-[9px] font-black text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full uppercase">Vence em {dias}d</span>}
                          {vencido && c.status !== 'cancelado' && <span className="text-[9px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full uppercase animate-pulse">Vencido há {Math.abs(dias!)}d</span>}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-3">
                          {c.contato && <span className="flex items-center gap-1"><User size={10}/> {c.contato}</span>}
                          {c.whatsapp && <span className="flex items-center gap-1"><Phone size={10}/> {c.whatsapp}</span>}
                          <span className="flex items-center gap-1"><Calendar size={10}/> Vence {fmtData(c.proximo_vencimento)}</span>
                          <span className="flex items-center gap-1"><DollarSign size={10}/> R$ {c.valor_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</span>
                        </div>

                        {c.modulos?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {c.modulos.map(m => (
                              <span key={m} className="text-[9px] font-black uppercase tracking-widest bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#22C55E] px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Package size={8}/> {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={() => registrarPagamento(c)}
                          disabled={registrandoPgto === c.id}
                          className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-50"
                        >
                          {registrandoPgto === c.id ? <Loader2 size={11} className="animate-spin"/> : <CheckCircle2 size={11}/>}
                          Pgto recebido
                        </button>
                        {c.whatsapp && (
                          <a
                            href={`https://wa.me/55${c.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${c.contato || ''}! Segue o Pix para renovação da assinatura WeGrow — R$ ${c.valor_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês. Vencimento: ${fmtData(c.proximo_vencimento)}.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                          >
                            <MessageCircle size={11}/> Cobrar
                          </a>
                        )}
                        <div className="flex gap-1.5">
                          <button onClick={() => abrirEdicao(c)} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 p-2 rounded-xl transition-all flex items-center justify-center">
                            <Edit2 size={12}/>
                          </button>
                          <button onClick={() => excluir(c.id)} className="flex-1 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-red-500 p-2 rounded-xl transition-all flex items-center justify-center">
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Modal novo/edição */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-black text-white uppercase italic tracking-tight">{editando ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-slate-500 hover:text-white transition-colors"><X size={18}/></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Nome da empresa *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="CDL de Taio" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
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
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Módulos contratados</label>
                <div className="flex flex-wrap gap-2">
                  {MODULOS_OPCOES.map(m => (
                    <button key={m} type="button" onClick={() => toggleModulo(m)}
                      className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-all ${form.modulos.includes(m) ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]' : 'bg-white/[0.02] border-white/10 text-slate-500 hover:border-white/20'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Valor mensal (R$)</label>
                  <input type="number" value={form.valor_mensal} onChange={e => setForm(f => ({ ...f, valor_mensal: e.target.value }))} placeholder="497" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors">
                    {Object.entries(STATUS_CONFIG).map(([val, cfg]) => <option key={val} value={val} className="bg-[#0B1120]">{cfg.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Início</label>
                  <input type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Próx. vencimento</label>
                  <input type="date" value={form.proximo_vencimento} onChange={e => setForm(f => ({ ...f, proximo_vencimento: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Observação</label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Notas internas..." rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors resize-none placeholder:text-slate-600"/>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3">
              <button onClick={() => setModalAberto(false)} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving || !form.nome.trim()} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-[#22C55E] text-[#0B1120] hover:bg-[#16A34A] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
