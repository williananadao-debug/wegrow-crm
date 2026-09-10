"use client";
import { useState, useEffect } from 'react';
import { Loader2, X, ListChecks, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ServicoConfig } from '@/app/pulse/shared';

type ItemPendente = {
  id: number;
  descricao: string;
  ncm: string | null;
  quantidade: number;
  valor_unitario: number;
  servico_id: number | null; // sugestão de casamento automático, já vem preenchida se achou parecido
};

type ItemRevisao = ItemPendente & { escolha: number | 'novo' | 'ignorar' };

// Itens que o Focus NFe capturou automaticamente do XML da nota (webhook ou backfill de
// histórico) chegam aqui como 'pendente' — essa tela é o único jeito deles virarem
// entrada de estoque de verdade. Casamento por nome é só sugestão (fiscal_notas_itens já
// vem com servico_id pré-preenchido quando achou parecido); confirmação final sempre
// passa por aqui, mesmo cuidado do fluxo de leitura por foto.
export default function RevisarItensNotaModal({
  aberto, onFechar, notaId, notaLabel, servicos, empresaId, userId, onConcluido,
}: {
  aberto: boolean;
  onFechar: () => void;
  notaId: number | null;
  notaLabel: string;
  servicos: ServicoConfig[];
  empresaId?: string;
  userId?: string;
  onConcluido: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<ItemRevisao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || !notaId) return;
    setCarregando(true); setErro(null);
    supabase.from('fiscal_notas_itens').select('id, descricao, ncm, quantidade, valor_unitario, servico_id')
      .eq('nota_id', notaId).eq('status', 'pendente').order('id')
      .then(({ data }) => {
        setItens((data || []).map((i: ItemPendente) => ({ ...i, escolha: i.servico_id ?? 'novo' })));
        setCarregando(false);
      });
  }, [aberto, notaId]);

  const atualizarEscolha = (id: number, escolha: number | 'novo' | 'ignorar') => {
    setItens(prev => prev.map(i => i.id === id ? { ...i, escolha } : i));
  };

  const confirmar = async () => {
    if (!notaId || !empresaId) return;
    setSalvando(true); setErro(null);
    try {
      for (const item of itens) {
        if (item.escolha === 'ignorar') {
          await supabase.from('fiscal_notas_itens').update({ status: 'ignorado' }).eq('id', item.id);
          continue;
        }

        let servicoId: number;
        if (item.escolha === 'novo') {
          const { data: criado, error: erroCriar } = await supabase.from('servicos').insert([{
            nome: item.descricao, preco: item.valor_unitario, tipo: 'Nota Fiscal', unidade: 'un',
            estoque: item.quantidade, empresa_id: empresaId,
          }]).select('id').single();
          if (erroCriar || !criado) throw new Error(erroCriar?.message || `Erro ao criar produto "${item.descricao}".`);
          servicoId = criado.id;
        } else {
          servicoId = item.escolha;
          const atual = servicos.find(s => s.id === servicoId);
          await supabase.from('servicos').update({ estoque: (atual?.estoque || 0) + item.quantidade }).eq('id', servicoId);
        }

        const { data: movimento } = await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: empresaId, servico_id: servicoId, quantidade: item.quantidade,
          valor_unitario: item.valor_unitario, user_id: userId,
          tipo: 'entrada_nf', motivo: 'compra',
          observacao: 'Item confirmado a partir do XML da NF-e (captura automática Focus NFe).',
        }]).select('id').single();

        await supabase.from('fiscal_notas_itens').update({
          status: 'confirmado', servico_id: servicoId, estoque_movimentacao_id: movimento?.id ?? null,
        }).eq('id', item.id);
      }

      await supabase.from('fiscal_notas').update({ itens_status: 'processado' }).eq('id', notaId);
      onConcluido();
      onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar os itens.');
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><ListChecks size={20} className="text-purple-400" /> Revisar itens</h3>
            <p className="text-slate-500 text-xs font-bold">{notaLabel} — confirme antes de dar entrada no estoque</p>
          </div>
          <button onClick={onFechar} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {carregando ? (
          <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
        ) : itens.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-10">Nenhum item pendente nessa nota.</p>
        ) : (
          <div className="space-y-3">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-200 text-[11px] font-bold leading-snug">O casamento com o produto é uma sugestão automática por nome — confira cada item antes de confirmar, principalmente variações (medida, cor) que parecem iguais mas não são.</p>
            </div>
            {itens.map(item => (
              <div key={item.id} className="bg-black/30 border border-white/10 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-white font-bold text-sm">{item.descricao}</p>
                  <p className="text-slate-400 text-xs font-bold shrink-0">{item.quantidade}x R$ {item.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <select
                  value={String(item.escolha)}
                  onChange={e => atualizarEscolha(item.id, e.target.value === 'novo' || e.target.value === 'ignorar' ? e.target.value : Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500"
                >
                  <option value="novo" className="bg-[#0B1120]">+ Criar produto novo com esse nome</option>
                  <option value="ignorar" className="bg-[#0B1120]">Ignorar (não afeta estoque)</option>
                  {servicos.map(s => <option key={s.id} value={s.id} className="bg-[#0B1120]">{s.id === item.servico_id ? '✓ ' : ''}{s.nome}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl mt-3">{erro}</div>}

        {itens.length > 0 && (
          <button onClick={confirmar} disabled={salvando} className="w-full mt-4 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {salvando ? 'Confirmando...' : `Confirmar ${itens.length} ${itens.length === 1 ? 'item' : 'itens'} e dar entrada`}
          </button>
        )}
      </div>
    </div>
  );
}
