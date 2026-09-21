"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Activity, ArrowLeft, Truck, Plus, X, Save, Trash2, Search, Phone, Mail, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ordenarPorNome } from '@/lib/ordenacao';
import { usePulseAccess } from '../../usePulseAccess';

type Fornecedor = { id: number; nome: string; cnpj: string | null; contato: string | null; telefone: string | null; email: string | null; prazo_entrega_dias: number | null; observacao: string | null; ativo: boolean };
type VinculoItem = { id: number; fornecedor_id: number; servico_id: number; codigo_fornecedor: string | null; ultimo_preco: number | null; ultima_compra: string | null };
type ServicoMin = { id: number; nome: string; tipo?: string | null; estoque?: number | null };

const VAZIO: Partial<Fornecedor> = { nome: '', cnpj: '', contato: '', telefone: '', email: '', prazo_entrega_dias: null, observacao: '', ativo: true };
const inp = 'w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-[var(--cor-primaria)]';
const lbl = 'block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1';

export default function FornecedoresPage() {
  const { authLoading, temPulse, perfil, isLideranca } = usePulseAccess();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [vinculos, setVinculos] = useState<VinculoItem[]>([]);
  const [servicos, setServicos] = useState<ServicoMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Partial<Fornecedor> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novoItem, setNovoItem] = useState<{ servico_id: string; codigo: string; preco: string }>({ servico_id: '', codigo: '', preco: '' });

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: f }, { data: v }, { data: s }] = await Promise.all([
      supabase.from('pulse_fornecedores').select('*').eq('empresa_id', perfil.empresa_id).order('nome'),
      supabase.from('pulse_fornecedor_itens').select('*').eq('empresa_id', perfil.empresa_id),
      supabase.from('servicos').select('id, nome, tipo, estoque').eq('empresa_id', perfil.empresa_id).not('estoque', 'is', null),
    ]);
    setFornecedores(ordenarPorNome((f || []) as Fornecedor[]));
    setVinculos((v || []) as VinculoItem[]);
    setServicos(ordenarPorNome((s || []) as ServicoMin[]));
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    if (!editando?.nome?.trim() || !perfil?.empresa_id) { setErro('Informe o nome do fornecedor.'); return; }
    setSalvando(true); setErro(null);
    const payload = {
      nome: editando.nome.trim(), cnpj: editando.cnpj || null, contato: editando.contato || null, telefone: editando.telefone || null,
      email: editando.email || null, prazo_entrega_dias: editando.prazo_entrega_dias ?? null, observacao: editando.observacao || null, ativo: editando.ativo ?? true,
    };
    const { error } = editando.id
      ? await supabase.from('pulse_fornecedores').update(payload).eq('id', editando.id)
      : await supabase.from('pulse_fornecedores').insert([{ ...payload, empresa_id: perfil.empresa_id }]);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setEditando(null); carregar();
  };

  const excluir = async (f: Fornecedor) => {
    if (!confirm(`Excluir o fornecedor ${f.nome}? Os vínculos com itens também são removidos.`)) return;
    await supabase.from('pulse_fornecedores').delete().eq('id', f.id);
    setEditando(null); carregar();
  };

  const vincular = async () => {
    if (!editando?.id || !novoItem.servico_id || !perfil?.empresa_id) return;
    const { error } = await supabase.from('pulse_fornecedor_itens').upsert([{
      empresa_id: perfil.empresa_id, fornecedor_id: editando.id, servico_id: Number(novoItem.servico_id),
      codigo_fornecedor: novoItem.codigo || null, ultimo_preco: novoItem.preco ? Number(novoItem.preco) : null,
    }], { onConflict: 'fornecedor_id,servico_id' });
    if (error) { setErro(error.message); return; }
    setNovoItem({ servico_id: '', codigo: '', preco: '' }); carregar();
  };
  const desvincular = async (id: number) => { await supabase.from('pulse_fornecedor_itens').delete().eq('id', id); carregar(); };
  const definirPadrao = async (servicoId: number, fornecedorId: number) => {
    await supabase.from('servicos').update({ fornecedor_padrao_id: fornecedorId }).eq('id', servicoId);
    setErro(null);
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temPulse) return <div className="p-8 text-slate-400 font-bold text-sm text-center"><Activity size={28} className="mx-auto mb-2 text-slate-600" />O módulo Pulse não está ativo.</div>;

  const visiveis = fornecedores.filter(f => !busca.trim() || `${f.nome} ${f.cnpj || ''} ${f.contato || ''}`.toLowerCase().includes(busca.toLowerCase()));
  const nomeServico = (id: number) => servicos.find(s => s.id === id)?.nome || `#${id}`;
  const vinculosDoEditando = editando?.id ? vinculos.filter(v => v.fornecedor_id === editando.id) : [];

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/pulse/estoque" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"><ArrowLeft size={16} className="text-slate-400" /></Link>
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3"><Truck size={28} /> Fornecedores</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Quem vende cada item, prazo de entrega e último preço</p>
          </div>
        </div>
        {isLideranca && <button onClick={() => { setEditando({ ...VAZIO }); setErro(null); }} className="inline-flex items-center gap-2 bg-[var(--cor-primaria)] text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest"><Plus size={14} /> Novo fornecedor</button>}
      </header>

      <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 mb-4 max-w-md">
        <Search size={14} className="text-slate-500" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar fornecedor…" className="flex-1 bg-transparent outline-none text-sm text-white" />
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div> : visiveis.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center"><Truck size={28} className="text-slate-600 mx-auto mb-2" /><p className="text-slate-500 text-sm font-bold">Nenhum fornecedor cadastrado ainda.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visiveis.map(f => {
            const itens = vinculos.filter(v => v.fornecedor_id === f.id);
            return (
              <button key={f.id} onClick={() => { if (isLideranca) { setEditando(f); setErro(null); } }} className={`text-left bg-[#0F172A] border border-white/10 rounded-2xl p-4 hover:border-white/25 transition-all ${f.ativo ? '' : 'opacity-50'}`}>
                <p className="font-black uppercase text-sm truncate">{f.nome}</p>
                <p className="text-[10px] text-slate-500 font-bold">{f.cnpj || 'sem CNPJ'}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  {f.contato && <p className="truncate">{f.contato}</p>}
                  {f.telefone && <p className="flex items-center gap-1.5"><Phone size={11} className="text-slate-600" />{f.telefone}</p>}
                  {f.email && <p className="flex items-center gap-1.5 truncate"><Mail size={11} className="text-slate-600" />{f.email}</p>}
                  <p className="flex items-center gap-1.5"><Clock size={11} className="text-slate-600" />{f.prazo_entrega_dias != null ? `Entrega em ${f.prazo_entrega_dias} dias` : 'Prazo não informado'}</p>
                </div>
                <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{itens.length} item(ns) vinculado(s)</p>
              </button>
            );
          })}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !salvando && setEditando(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-black uppercase italic">{editando.id ? editando.nome : 'Novo fornecedor'}</h3>
              <button onClick={() => setEditando(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              {erro && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold rounded-xl p-3">{erro}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 block"><span className={lbl}>Nome</span><input value={editando.nome || ''} onChange={e => setEditando(v => ({ ...v, nome: e.target.value }))} className={inp} /></label>
                <label className="block"><span className={lbl}>CNPJ</span><input value={editando.cnpj || ''} onChange={e => setEditando(v => ({ ...v, cnpj: e.target.value }))} className={inp} /></label>
                <label className="block"><span className={lbl}>Prazo de entrega (dias)</span><input type="number" min="0" value={editando.prazo_entrega_dias ?? ''} onChange={e => setEditando(v => ({ ...v, prazo_entrega_dias: e.target.value === '' ? null : Number(e.target.value) }))} className={inp} /></label>
                <label className="block"><span className={lbl}>Contato</span><input value={editando.contato || ''} onChange={e => setEditando(v => ({ ...v, contato: e.target.value }))} className={inp} /></label>
                <label className="block"><span className={lbl}>Telefone / WhatsApp</span><input value={editando.telefone || ''} onChange={e => setEditando(v => ({ ...v, telefone: e.target.value }))} className={inp} /></label>
                <label className="col-span-2 block"><span className={lbl}>E-mail</span><input value={editando.email || ''} onChange={e => setEditando(v => ({ ...v, email: e.target.value }))} className={inp} /></label>
                <label className="col-span-2 block"><span className={lbl}>Observação</span><input value={editando.observacao || ''} onChange={e => setEditando(v => ({ ...v, observacao: e.target.value }))} className={inp} /></label>
                <label className="col-span-2 flex items-center gap-2 text-xs text-slate-300 font-bold"><input type="checkbox" checked={editando.ativo ?? true} onChange={e => setEditando(v => ({ ...v, ativo: e.target.checked }))} className="accent-[var(--cor-primaria)]" /> Fornecedor ativo</label>
              </div>

              {editando.id && (
                <div>
                  <p className={lbl}>Itens que ele vende</p>
                  <div className="space-y-1.5 mb-3">
                    {vinculosDoEditando.map(v => (
                      <div key={v.id} className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-xs">
                        <span className="flex-1 min-w-0 truncate font-bold">{nomeServico(v.servico_id)}</span>
                        <span className="text-slate-500 font-mono">{v.codigo_fornecedor || '—'}</span>
                        <span className="text-slate-300 font-bold w-24 text-right">{v.ultimo_preco != null ? `R$ ${Number(v.ultimo_preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</span>
                        <button onClick={() => definirPadrao(v.servico_id, v.fornecedor_id)} title="Definir como fornecedor padrão desse item" className="text-[9px] font-black uppercase text-[var(--cor-primaria)] hover:underline">padrão</button>
                        <button onClick={() => desvincular(v.id)} className="text-slate-600 hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    ))}
                    {vinculosDoEditando.length === 0 && <p className="text-slate-600 text-xs">Nenhum item vinculado.</p>}
                  </div>
                  <div className="grid grid-cols-[1fr_120px_110px_auto] gap-2 items-end">
                    <label className="block"><span className={lbl}>Item</span>
                      <select value={novoItem.servico_id} onChange={e => setNovoItem(v => ({ ...v, servico_id: e.target.value }))} className={inp}>
                        <option value="" className="bg-[#0B1120]">Selecione…</option>{servicos.map(s => <option key={s.id} value={s.id} className="bg-[#0B1120]">{s.nome}</option>)}
                      </select></label>
                    <label className="block"><span className={lbl}>Cód. dele</span><input value={novoItem.codigo} onChange={e => setNovoItem(v => ({ ...v, codigo: e.target.value }))} className={inp} /></label>
                    <label className="block"><span className={lbl}>Preço (R$)</span><input type="number" step="0.01" value={novoItem.preco} onChange={e => setNovoItem(v => ({ ...v, preco: e.target.value }))} className={inp} /></label>
                    <button onClick={vincular} disabled={!novoItem.servico_id} className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-black uppercase disabled:opacity-40"><Plus size={14} /></button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-white/10 flex gap-3">
              {editando.id && <button onClick={() => excluir(editando as Fornecedor)} className="p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"><Trash2 size={16} /></button>}
              <button onClick={salvar} disabled={salvando} className="flex-1 py-3 rounded-xl bg-[var(--cor-primaria)] text-[#0B1120] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
