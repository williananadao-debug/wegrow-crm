"use client";
import { useState, useEffect, useRef } from 'react';
import { Loader2, Activity, Boxes, Package, Minus, Plus, Camera, ScanLine, X, CheckCircle2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig } from '../shared';

type ItemNota = {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  servicoId: number | 'novo' | 'ignorar';
};

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const acharServicoParecido = (descricao: string, servicos: ServicoConfig[]): number | null => {
  const alvo = normalizar(descricao);
  const exato = servicos.find(s => normalizar(s.nome) === alvo);
  if (exato) return exato.id;
  const parcial = servicos.find(s => normalizar(s.nome).includes(alvo) || alvo.includes(normalizar(s.nome)));
  return parcial ? parcial.id : null;
};

export default function PulseEstoquePage() {
  const { authLoading, temPulse, user, perfil } = usePulseAccess();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(true);

  const fetchServicos = async () => {
    setLoadingServicos(true);
    const { data } = await supabase.from('servicos').select('*').order('nome', { ascending: true });
    if (data) setServicos(data as ServicoConfig[]);
    setLoadingServicos(false);
  };

  useEffect(() => { fetchServicos(); }, []);

  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);

  const ajustarEstoque = async (s: ServicoConfig, delta: number) => {
    const novo = Math.max(0, (s.estoque || 0) + delta);
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
  };

  // --- Entrada por Nota Fiscal (IA) ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notaModalOpen, setNotaModalOpen] = useState(false);
  const [notaEtapa, setNotaEtapa] = useState<'foto' | 'lendo' | 'revisao'>('foto');
  const [notaImagem, setNotaImagem] = useState<string | null>(null);
  const [notaFornecedor, setNotaFornecedor] = useState('');
  const [notaValorTotal, setNotaValorTotal] = useState('');
  const [notaDataVencimento, setNotaDataVencimento] = useState(() => new Date().toISOString().substring(0, 10));
  const [notaItens, setNotaItens] = useState<ItemNota[]>([]);
  const [notaErro, setNotaErro] = useState<string | null>(null);
  const [notaSalvando, setNotaSalvando] = useState(false);

  const abrirModalNota = () => {
    setNotaEtapa('foto'); setNotaImagem(null); setNotaFornecedor(''); setNotaValorTotal('');
    setNotaDataVencimento(new Date().toISOString().substring(0, 10));
    setNotaItens([]); setNotaErro(null); setNotaModalOpen(true);
  };

  const fecharModalNota = () => { if (!notaSalvando) setNotaModalOpen(false); };

  const selecionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setNotaImagem(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const lerNota = async () => {
    if (!notaImagem) return;
    setNotaEtapa('lendo'); setNotaErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/pulse/ler-nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ imagemBase64: notaImagem }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao ler a nota.');

      const itens: ItemNota[] = (json.itens || []).map((i: any) => ({
        descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
        servicoId: acharServicoParecido(i.descricao, servicos) ?? 'novo',
      }));
      const totalCalculado = itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0);

      setNotaFornecedor(json.fornecedor || '');
      setNotaValorTotal(String(json.valor_total ?? (totalCalculado || '')));
      setNotaItens(itens);
      setNotaEtapa('revisao');
    } catch (err: any) {
      setNotaErro(err?.message || 'Erro ao ler a nota.');
      setNotaEtapa('foto');
    }
  };

  const atualizarItemNota = (index: number, patch: Partial<ItemNota>) => {
    setNotaItens(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  const removerItemNota = (index: number) => {
    setNotaItens(prev => prev.filter((_, i) => i !== index));
  };

  const confirmarEntradaNota = async () => {
    if (notaItens.length === 0) return setNotaErro('Nenhum item pra dar entrada.');
    if (!notaValorTotal || Number(notaValorTotal) <= 0) return setNotaErro('Informe o valor total da nota.');
    if (!notaDataVencimento) return setNotaErro('Informe a data de vencimento.');
    setNotaSalvando(true); setNotaErro(null);
    try {
      const itensValidos = notaItens.filter(i => i.servicoId !== 'ignorar');

      for (const item of itensValidos) {
        if (item.servicoId === 'novo') {
          await supabase.from('servicos').insert([{
            nome: item.descricao, preco: item.valor_unitario, tipo: 'Nota Fiscal', unidade: 'un',
            estoque: item.quantidade, empresa_id: perfil?.empresa_id,
          }]);
        } else {
          const atual = servicos.find(s => s.id === item.servicoId);
          const novoEstoque = (atual?.estoque || 0) + item.quantidade;
          await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', item.servicoId);
        }
      }

      const { error: erroLancamento } = await supabase.from('lancamentos').insert([{
        titulo: notaFornecedor ? `Nota Fiscal - ${notaFornecedor}` : 'Nota Fiscal - Entrada de estoque',
        valor: Number(notaValorTotal), tipo: 'saida', categoria: 'Fornecedor', status: 'pendente',
        data_vencimento: notaDataVencimento, user_id: user?.id, empresa_id: perfil?.empresa_id,
      }]);
      if (erroLancamento) throw new Error(erroLancamento.message);

      await fetchServicos();
      setNotaModalOpen(false);
    } catch (err: any) {
      setNotaErro(err?.message || 'Erro ao confirmar entrada.');
    } finally {
      setNotaSalvando(false);
    }
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
            <Boxes size={32} /> Estoque
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Ajuste rápido — salva na hora</p>
        </div>
        <button onClick={abrirModalNota} className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all self-start md:self-auto">
          <ScanLine size={14} /> Dar entrada por Nota Fiscal
        </button>
      </header>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-black uppercase text-sm text-slate-300">Produtos com controle de estoque ({produtosComEstoque.length})</h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Pra cadastrar foto/preço ou ligar o controle num produto novo, vai em Configurações → Catálogo</p>
        </div>
        {loadingServicos ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : produtosComEstoque.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhum produto com estoque controlado ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {[...produtosComEstoque].sort((a, b) => (a.estoque as number) - (b.estoque as number)).map(s => {
              const baixo = (s.estoque as number) <= 5;
              return (
                <div key={s.id} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {s.imagem_url ? <img src={s.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-slate-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{s.nome}</p>
                    <p className="text-slate-500 text-[10px]">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <button onClick={() => ajustarEstoque(s, -1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Minus size={13} /></button>
                  <span className={`text-sm font-black w-10 text-center ${baixo ? 'text-red-400' : 'text-white'}`}>{s.estoque}</span>
                  <button onClick={() => ajustarEstoque(s, 1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Plus size={13} /></button>
                  {baixo && <span className="text-[9px] font-black text-red-400 uppercase ml-1">baixo</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notaModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={fecharModalNota}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-white uppercase italic text-lg">Entrada por Nota Fiscal</h3>
                <p className="text-slate-500 text-xs font-bold">Foto da nota → IA lê os itens → você confirma</p>
              </div>
              <button onClick={fecharModalNota} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
            </div>

            {notaEtapa === 'foto' && (
              <div className="space-y-4">
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={selecionarFoto} className="hidden" />
                {notaImagem ? (
                  <div className="space-y-3">
                    <img src={notaImagem} alt="Nota fiscal" className="w-full max-h-80 object-contain rounded-2xl border border-white/10 bg-black/30" />
                    <div className="flex gap-2">
                      <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 py-3 rounded-xl text-xs font-black uppercase">Trocar foto</button>
                      <button onClick={lerNota} className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2">
                        <ScanLine size={14} /> Ler Nota com IA
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-white/10 hover:border-purple-500/40 rounded-2xl py-14 flex flex-col items-center gap-3 text-slate-400 hover:text-purple-400 transition-colors">
                    <Camera size={32} />
                    <span className="text-xs font-black uppercase tracking-widest">Tirar foto ou escolher da galeria</span>
                  </button>
                )}
                {notaErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{notaErro}</div>}
              </div>
            )}

            {notaEtapa === 'lendo' && (
              <div className="py-16 flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-purple-400" />
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Lendo a nota...</p>
              </div>
            )}

            {notaEtapa === 'revisao' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Fornecedor</label>
                    <input value={notaFornecedor} onChange={e => setNotaFornecedor(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Vencimento</label>
                    <input type="date" value={notaDataVencimento} onChange={e => setNotaDataVencimento(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor total da nota (vai pra Contas a Pagar)</label>
                  <input type="number" step="0.01" value={notaValorTotal} onChange={e => setNotaValorTotal(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens lidos ({notaItens.length})</p>
                  {notaItens.length === 0 && <p className="text-slate-500 text-xs font-bold p-3">Nenhum item identificado.</p>}
                  {notaItens.map((item, i) => (
                    <div key={i} className="bg-black/30 border border-white/5 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white font-bold text-sm truncate">{item.descricao}</p>
                        <button onClick={() => removerItemNota(i)} className="text-slate-500 hover:text-red-400 p-1 flex-shrink-0"><Trash2 size={14} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" step="1" min="0" value={item.quantidade} onChange={e => atualizarItemNota(i, { quantidade: Number(e.target.value) })} placeholder="Qtd" className="bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500" />
                        <input type="number" step="0.01" min="0" value={item.valor_unitario} onChange={e => atualizarItemNota(i, { valor_unitario: Number(e.target.value) })} placeholder="Valor unit." className="bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500" />
                      </div>
                      <select
                        value={String(item.servicoId)}
                        onChange={e => atualizarItemNota(i, { servicoId: e.target.value === 'novo' || e.target.value === 'ignorar' ? e.target.value as any : Number(e.target.value) })}
                        className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500"
                      >
                        <option value="novo" className="bg-[#0B1120]">+ Criar novo produto "{item.descricao}"</option>
                        <option value="ignorar" className="bg-[#0B1120]">Ignorar este item (não mexe no estoque)</option>
                        {servicos.map(s => (
                          <option key={s.id} value={s.id} className="bg-[#0B1120]">Somar no estoque de: {s.nome}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {notaErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{notaErro}</div>}

                <button onClick={confirmarEntradaNota} disabled={notaSalvando} className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] font-black uppercase text-xs tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {notaSalvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {notaSalvando ? 'Confirmando...' : 'Confirmar entrada e lançar despesa'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
