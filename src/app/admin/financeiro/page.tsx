"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  ArrowLeft, ShieldAlert, Loader2, RefreshCw, Wallet, X, Save,
  Plus, Trash2, TrendingUp, TrendingDown, Repeat, Receipt, CheckCircle2, Circle,
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type Lancamento = {
  id: number;
  tipo: 'entrada' | 'saida';
  categoria: string;
  descricao: string;
  valor: number;
  recorrente: boolean;
  data: string;
  pago: boolean;
  observacao: string | null;
};

const CATEGORIAS = ['ferramenta', 'infra', 'contabilidade', 'comissao', 'imposto', 'marketing', 'outro'];
const CATEGORIA_LABEL: Record<string, string> = {
  ferramenta: 'Ferramenta', infra: 'Infra', contabilidade: 'Contabilidade',
  comissao: 'Comissão', imposto: 'Imposto', marketing: 'Marketing', outro: 'Outro',
};

const VAZIO: Partial<Lancamento> = { tipo: 'saida', categoria: 'outro', descricao: '', valor: 0, recorrente: false, data: new Date().toISOString().substring(0, 10), pago: true, observacao: '' };

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FinanceiroPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [mrr, setMrr] = useState(0);
  const [empresasAtivas, setEmpresasAtivas] = useState(0);

  const [editando, setEditando] = useState<Partial<Lancamento> | null>(null);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token && isAdmin) carregar(); }, [token, isAdmin]);

  const carregar = async () => {
    setLoading(true);
    const [resFin, resEmpresas, resBillings] = await Promise.all([
      fetch('/api/admin/financeiro', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/admin/empresas', { headers: { Authorization: `Bearer ${token}` } }),
      supabase.from('clientes_wegrow').select('empresa_id, valor_mensal'),
    ]);
    if (resFin.ok) {
      const json = await resFin.json();
      setSemTabela(!!json.semTabela);
      setLancamentos(json.itens || []);
    }
    if (resEmpresas.ok) {
      const empresas = await resEmpresas.json();
      const ativasIds = new Set((empresas || []).filter((e: any) => e.status !== 'suspensa').map((e: any) => e.id));
      setEmpresasAtivas(ativasIds.size);
      const somaMrr = (resBillings.data || []).filter((b: any) => ativasIds.has(b.empresa_id)).reduce((s: number, b: any) => s + (b.valor_mensal ?? 0), 0);
      setMrr(somaMrr);
    }
    setLoading(false);
  };

  const abrirEdicao = (l: Lancamento) => { setEditando(l); setCriandoNovo(false); setErro(null); };
  const abrirNovo = (tipo?: 'entrada' | 'saida') => { setEditando({ ...VAZIO, ...(tipo ? { tipo } : {}) }); setCriandoNovo(true); setErro(null); };

  const salvar = async () => {
    if (!editando) return;
    setSaving(true); setErro(null);
    const isNovo = criandoNovo;
    const method = isNovo ? 'POST' : 'PATCH';
    const body = isNovo ? editando : { id: (editando as Lancamento).id, ...editando };
    const res = await fetch('/api/admin/financeiro', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErro(j.erro || 'Erro ao salvar.'); return; }
    setEditando(null); carregar();
  };

  const excluir = async (id: number) => {
    if (!confirm('Remover este lançamento?')) return;
    await fetch(`/api/admin/financeiro?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setEditando(null); carregar();
  };

  const togglePago = async (l: Lancamento) => {
    setLancamentos(prev => prev.map(x => x.id === l.id ? { ...x, pago: !x.pago } : x));
    await fetch('/api/admin/financeiro', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: l.id, pago: !l.pago }),
    });
  };

  const { recorrentes, avulsos, despesaFixaMensal, entradaFixaMensal, mesAtualEntradas, mesAtualSaidas, resultadoMes, serie6meses } = useMemo(() => {
    const recorrentes = lancamentos.filter(l => l.recorrente);
    const avulsos = lancamentos.filter(l => !l.recorrente).sort((a, b) => b.data.localeCompare(a.data));
    const despesaFixaMensal = recorrentes.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
    const entradaFixaMensal = recorrentes.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);

    const hoje = new Date();
    const mesAtual = hoje.toISOString().substring(0, 7);
    const mesAtualEntradas = avulsos.filter(l => l.tipo === 'entrada' && l.data.startsWith(mesAtual)).reduce((s, l) => s + l.valor, 0);
    const mesAtualSaidas = avulsos.filter(l => l.tipo === 'saida' && l.data.startsWith(mesAtual)).reduce((s, l) => s + l.valor, 0);

    const impostoEstimado = mrr * 0.06; // Anexo III, mesma estimativa usada no admin principal
    const resultadoMes = mrr + entradaFixaMensal + mesAtualEntradas - despesaFixaMensal - mesAtualSaidas - impostoEstimado;

    const serie6meses = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entradasMes = avulsos.filter(l => l.tipo === 'entrada' && l.data.startsWith(chave)).reduce((s, l) => s + l.valor, 0) + (i === 5 ? mrr + entradaFixaMensal : entradaFixaMensal);
      const saidasMes = avulsos.filter(l => l.tipo === 'saida' && l.data.startsWith(chave)).reduce((s, l) => s + l.valor, 0) + despesaFixaMensal;
      return { label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, entradas: entradasMes, saidas: saidasMes };
    });

    return { recorrentes, avulsos, despesaFixaMensal, entradaFixaMensal, mesAtualEntradas, mesAtualSaidas, resultadoMes, serie6meses };
  }, [lancamentos, mrr]);

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert size={40} className="text-red-500 mx-auto mb-3"/><p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p></div>
    </div>
  );

  const maxSerie = Math.max(1, ...serie6meses.flatMap(m => [m.entradas, m.saidas]));

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <ArrowLeft size={16} className="text-slate-400"/>
            </Link>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                <Wallet size={22} className="text-[#22C55E]"/> Financeiro
              </h1>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Fluxo de caixa da própria WeGrow · não é dado de cliente</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => abrirNovo('saida')} className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              <TrendingDown size={13}/> Saída
            </button>
            <button onClick={() => abrirNovo('entrada')} className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              <TrendingUp size={13}/> Entrada
            </button>
            <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <RefreshCw size={16} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`}/>
            </button>
          </div>
        </div>

        {semTabela && (
          <div className="bg-[#0F172A] border border-yellow-500/20 rounded-3xl p-8 mb-6">
            <p className="text-yellow-400 font-black text-sm uppercase tracking-widest mb-4">Rode a migração no Supabase</p>
            <p className="text-slate-400 text-xs mb-3">Execute <code className="text-[#22C55E] font-mono">supabase/migrations/20260904100000_wegrow_financeiro.sql</code> no SQL Editor do Supabase Studio — cria a tabela e já semeia com as despesas fixas que hoje estavam hardcoded no admin.</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600"/></div>
        ) : !semTabela && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">MRR ({empresasAtivas} ativas)</p>
                <p className="text-xl font-black text-[#22C55E]">R$ {fmtBRL(mrr)}</p>
              </div>
              <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Despesa fixa/mês</p>
                <p className="text-xl font-black text-red-400">R$ {fmtBRL(despesaFixaMensal)}</p>
              </div>
              <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Avulsos este mês</p>
                <p className="text-xl font-black text-white">+{fmtBRL(mesAtualEntradas)} / -{fmtBRL(mesAtualSaidas)}</p>
              </div>
              <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Resultado projetado (mês)</p>
                <p className={`text-xl font-black ${resultadoMes >= 0 ? 'text-[#22C55E]' : 'text-red-400'}`}>R$ {fmtBRL(resultadoMes)}</p>
              </div>
            </div>

            {/* Gráfico 6 meses */}
            <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5 mb-6">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Entradas × saídas — últimos 6 meses</p>
              <div className="space-y-3">
                {serie6meses.map((m, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-500 uppercase w-10 shrink-0">{m.label}</span>
                    <div className="flex-1 space-y-1">
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[#22C55E] rounded-full transition-all" style={{ width: `${(m.entradas / maxSerie) * 100}%` }}/>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${(m.saidas / maxSerie) * 100}%` }}/>
                      </div>
                    </div>
                    <div className="text-right w-24 shrink-0">
                      <p className="text-[10px] font-black text-[#22C55E]">R$ {fmtBRL(m.entradas)}</p>
                      <p className="text-[10px] font-black text-red-400">R$ {fmtBRL(m.saidas)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Despesas/receitas fixas (recorrentes) */}
            <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5 mb-6">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Repeat size={12}/> Fixos recorrentes ({recorrentes.length})</p>
              <div className="space-y-1.5">
                {recorrentes.map(l => (
                  <button key={l.id} onClick={() => abrirEdicao(l)} className="w-full text-left flex items-center justify-between gap-3 bg-white/[0.02] hover:bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${l.tipo === 'entrada' ? 'text-[#22C55E] border-[#22C55E]/30 bg-[#22C55E]/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>{CATEGORIA_LABEL[l.categoria] || l.categoria}</span>
                      <span className="text-sm font-bold text-white truncate">{l.descricao}</span>
                    </div>
                    <span className={`font-mono text-sm font-black shrink-0 ${l.tipo === 'entrada' ? 'text-[#22C55E]' : 'text-red-400'}`}>{l.tipo === 'entrada' ? '+' : '-'}R$ {fmtBRL(l.valor)}</span>
                  </button>
                ))}
                {recorrentes.length === 0 && <p className="text-slate-600 text-xs py-4 text-center">Nenhum fixo cadastrado.</p>}
              </div>
            </div>

            {/* Lançamentos avulsos */}
            <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Receipt size={12}/> Lançamentos avulsos ({avulsos.length})</p>
              <div className="space-y-1.5">
                {avulsos.map(l => (
                  <div key={l.id} className="flex items-center justify-between gap-3 bg-white/[0.02] hover:bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 transition-colors">
                    <button onClick={() => togglePago(l)} title={l.pago ? 'Pago — clique pra marcar como pendente' : 'Pendente — clique pra marcar como pago'} className="shrink-0">
                      {l.pago ? <CheckCircle2 size={15} className="text-[#22C55E]"/> : <Circle size={15} className="text-slate-600"/>}
                    </button>
                    <button onClick={() => abrirEdicao(l)} className="flex-1 text-left flex items-center gap-2.5 min-w-0">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${l.tipo === 'entrada' ? 'text-[#22C55E] border-[#22C55E]/30 bg-[#22C55E]/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>{CATEGORIA_LABEL[l.categoria] || l.categoria}</span>
                      <span className="text-sm font-bold text-white truncate">{l.descricao}</span>
                      <span className="text-[10px] text-slate-600 shrink-0">{new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                    </button>
                    <span className={`font-mono text-sm font-black shrink-0 ${l.tipo === 'entrada' ? 'text-[#22C55E]' : 'text-red-400'}`}>{l.tipo === 'entrada' ? '+' : '-'}R$ {fmtBRL(l.valor)}</span>
                    <button onClick={() => excluir(l.id)} className="text-slate-600 hover:text-red-400 transition-colors shrink-0"><Trash2 size={13}/></button>
                  </div>
                ))}
                {avulsos.length === 0 && <p className="text-slate-600 text-xs py-4 text-center">Nenhum lançamento avulso ainda.</p>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {editando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
              <h2 className="font-black text-white uppercase italic tracking-tight">{criandoNovo ? 'Novo lançamento' : 'Editar lançamento'}</h2>
              <button onClick={() => setEditando(null)} className="text-slate-500 hover:text-white transition-colors"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {erro && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-red-400 text-xs font-bold">{erro}</div>}

              <div className="flex gap-2">
                <button onClick={() => setEditando(v => ({ ...v, tipo: 'saida' }))} className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${editando.tipo === 'saida' ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>Saída</button>
                <button onClick={() => setEditando(v => ({ ...v, tipo: 'entrada' }))} className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${editando.tipo === 'entrada' ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#22C55E]' : 'bg-white/5 border-white/10 text-slate-500'}`}>Entrada</button>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Descrição</label>
                <input value={editando.descricao || ''} onChange={e => setEditando(v => ({ ...v, descricao: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Valor (R$)</label>
                  <input type="number" step="0.01" min="0" value={editando.valor ?? 0} onChange={e => setEditando(v => ({ ...v, valor: parseFloat(e.target.value) || 0 }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Categoria</label>
                  <select value={editando.categoria || 'outro'} onChange={e => setEditando(v => ({ ...v, categoria: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors">
                    {CATEGORIAS.map(c => <option key={c} value={c} className="bg-[#0B1120]">{CATEGORIA_LABEL[c]}</option>)}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer">
                <input type="checkbox" checked={!!editando.recorrente} onChange={e => setEditando(v => ({ ...v, recorrente: e.target.checked }))} className="w-4 h-4 accent-[#22C55E]"/>
                <span className="text-[11px] font-bold text-slate-400">Recorrente <span className="text-slate-600 font-normal">(fixo todo mês — ex: assinatura de ferramenta)</span></span>
              </label>

              {!editando.recorrente && (
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Data</label>
                  <input type="date" value={editando.data || ''} onChange={e => setEditando(v => ({ ...v, data: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
              )}

              <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer">
                <input type="checkbox" checked={editando.pago ?? true} onChange={e => setEditando(v => ({ ...v, pago: e.target.checked }))} className="w-4 h-4 accent-[#22C55E]"/>
                <span className="text-[11px] font-bold text-slate-400">Já pago/recebido</span>
              </label>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Observação</label>
                <textarea value={editando.observacao || ''} onChange={e => setEditando(v => ({ ...v, observacao: e.target.value }))} rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors resize-none"/>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3 flex-shrink-0">
              {!criandoNovo && (
                <button onClick={() => excluir((editando as Lancamento).id)} className="p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-colors">
                  <Trash2 size={16}/>
                </button>
              )}
              <button onClick={() => setEditando(null)} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                Fechar
              </button>
              <button onClick={salvar} disabled={saving || !editando.descricao} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-[#22C55E] text-[#0B1120] hover:bg-[#16A34A] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
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
