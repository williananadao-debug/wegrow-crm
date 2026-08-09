"use client";
import { useState, useRef } from 'react';
import { Loader2, Camera, ScanLine, X, CheckCircle2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ServicoConfig } from '@/app/pulse/shared';

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

export default function NotaFiscalModal({
  aberto, onFechar, servicos, empresaId, userId, onConcluido,
}: {
  aberto: boolean;
  onFechar: () => void;
  servicos: ServicoConfig[];
  empresaId?: string;
  userId?: string;
  onConcluido: (resumo: { fornecedor: string; valorTotal: number; itens: number }) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<'foto' | 'lendo' | 'revisao'>('foto');
  const [imagem, setImagem] = useState<string | null>(null);
  const [fornecedor, setFornecedor] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [dataVencimento, setDataVencimento] = useState(() => new Date().toISOString().substring(0, 10));
  const [itens, setItens] = useState<ItemNota[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const reset = () => {
    setEtapa('foto'); setImagem(null); setFornecedor(''); setValorTotal('');
    setDataVencimento(new Date().toISOString().substring(0, 10));
    setItens([]); setErro(null);
  };

  const fechar = () => { if (!salvando) { reset(); onFechar(); } };

  const selecionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagem(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const lerNota = async () => {
    if (!imagem) return;
    setEtapa('lendo'); setErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/pulse/ler-nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ imagemBase64: imagem }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao ler a nota.');

      const itensLidos: ItemNota[] = (json.itens || []).map((i: any) => ({
        descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
        servicoId: acharServicoParecido(i.descricao, servicos) ?? 'novo',
      }));
      const totalCalculado = itensLidos.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0);

      setFornecedor(json.fornecedor || '');
      setValorTotal(String(json.valor_total ?? (totalCalculado || '')));
      setItens(itensLidos);
      setEtapa('revisao');
    } catch (err: any) {
      setErro(err?.message || 'Erro ao ler a nota.');
      setEtapa('foto');
    }
  };

  const atualizarItem = (index: number, patch: Partial<ItemNota>) => {
    setItens(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  const removerItem = (index: number) => setItens(prev => prev.filter((_, i) => i !== index));

  const confirmar = async () => {
    if (itens.length === 0) return setErro('Nenhum item pra dar entrada.');
    if (!valorTotal || Number(valorTotal) <= 0) return setErro('Informe o valor total da nota.');
    if (!dataVencimento) return setErro('Informe a data de vencimento.');
    setSalvando(true); setErro(null);
    try {
      const itensValidos = itens.filter(i => i.servicoId !== 'ignorar');

      for (const item of itensValidos) {
        if (item.servicoId === 'novo') {
          await supabase.from('servicos').insert([{
            nome: item.descricao, preco: item.valor_unitario, tipo: 'Nota Fiscal', unidade: 'un',
            estoque: item.quantidade, empresa_id: empresaId,
          }]);
        } else {
          const atual = servicos.find(s => s.id === item.servicoId);
          const novoEstoque = (atual?.estoque || 0) + item.quantidade;
          await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', item.servicoId);
        }
      }

      const { error: erroLancamento } = await supabase.from('lancamentos').insert([{
        titulo: fornecedor ? `Nota Fiscal - ${fornecedor}` : 'Nota Fiscal - Entrada de estoque',
        valor: Number(valorTotal), tipo: 'saida', categoria: 'Fornecedor', status: 'pendente',
        data_vencimento: dataVencimento, user_id: userId, empresa_id: empresaId,
      }]);
      if (erroLancamento) throw new Error(erroLancamento.message);

      onConcluido({ fornecedor, valorTotal: Number(valorTotal), itens: itensValidos.length });
      reset();
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao confirmar entrada.');
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={fechar}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-white uppercase italic text-lg">Entrada por Nota Fiscal</h3>
            <p className="text-slate-500 text-xs font-bold">Foto da nota → IA lê os itens → você confirma</p>
          </div>
          <button onClick={fechar} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {etapa === 'foto' && (
          <div className="space-y-4">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={selecionarFoto} className="hidden" />
            {imagem ? (
              <div className="space-y-3">
                <img src={imagem} alt="Nota fiscal" className="w-full max-h-80 object-contain rounded-2xl border border-white/10 bg-black/30" />
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
            {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}
          </div>
        )}

        {etapa === 'lendo' && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-purple-400" />
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Lendo a nota...</p>
          </div>
        )}

        {etapa === 'revisao' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Fornecedor</label>
                <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Vencimento</label>
                <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor total da nota (vai pra Contas a Pagar)</label>
              <input type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens lidos ({itens.length})</p>
              {itens.length === 0 && <p className="text-slate-500 text-xs font-bold p-3">Nenhum item identificado.</p>}
              {itens.map((item, i) => (
                <div key={i} className="bg-black/30 border border-white/5 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-bold text-sm truncate">{item.descricao}</p>
                    <button onClick={() => removerItem(i)} className="text-slate-500 hover:text-red-400 p-1 flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" step="1" min="0" value={item.quantidade} onChange={e => atualizarItem(i, { quantidade: Number(e.target.value) })} placeholder="Qtd" className="bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500" />
                    <input type="number" step="0.01" min="0" value={item.valor_unitario} onChange={e => atualizarItem(i, { valor_unitario: Number(e.target.value) })} placeholder="Valor unit." className="bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500" />
                  </div>
                  <select
                    value={String(item.servicoId)}
                    onChange={e => atualizarItem(i, { servicoId: e.target.value === 'novo' || e.target.value === 'ignorar' ? e.target.value as any : Number(e.target.value) })}
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

            {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}

            <button onClick={confirmar} disabled={salvando} className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] font-black uppercase text-xs tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {salvando ? 'Confirmando...' : 'Confirmar entrada e lançar despesa'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
