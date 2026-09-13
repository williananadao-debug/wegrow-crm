"use client";
import { useState, useEffect } from 'react';
import { Loader2, X, ListChecks, Check, AlertTriangle, Plus, Trash2, PenLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ServicoConfig } from '@/app/pulse/shared';
import { acharServicoParecido } from '@/lib/matchProduto';

type ItemPendente = {
  id: number;
  descricao: string;
  ncm: string | null;
  quantidade: number;
  valor_unitario: number;
  servico_id: number | null; // sugestão de casamento automático, já vem preenchida se achou parecido
};

type ItemRevisao = ItemPendente & { escolha: number | 'novo' | 'ignorar' };

// Linha digitada na mão — mesma estrutura de ItemRevisao, só que sem id do banco ainda
// (nasce direto em fiscal_notas_itens no momento de confirmar, não antes).
type ItemManual = { chave: string; descricao: string; quantidade: string; valorUnitario: string; escolha: number | 'novo' | 'ignorar' };
const novaChaveManual = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

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
  const [itensManuais, setItensManuais] = useState<ItemManual[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || !notaId) return;
    setCarregando(true); setErro(null); setItensManuais([]);
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

  const adicionarLinhaManual = () => {
    setItensManuais(prev => [...prev, { chave: novaChaveManual(), descricao: '', quantidade: '1', valorUnitario: '', escolha: 'novo' }]);
  };
  const atualizarLinhaManual = (chave: string, patch: Partial<ItemManual>) => {
    setItensManuais(prev => prev.map(i => {
      if (i.chave !== chave) return i;
      const atualizado = { ...i, ...patch };
      // Casa com o catálogo em tempo real conforme a pessoa digita a descrição — mesma
      // lógica de sugestão automática do XML, só que a partir de texto digitado.
      if (patch.descricao !== undefined) {
        const achado = acharServicoParecido(patch.descricao, servicos);
        atualizado.escolha = achado ?? 'novo';
      }
      return atualizado;
    }));
  };
  const removerLinhaManual = (chave: string) => setItensManuais(prev => prev.filter(i => i.chave !== chave));

  const confirmar = async () => {
    if (!notaId || !empresaId) return;

    // Linha manual em branco (usuário clicou "+" mas não preencheu) não trava a
    // confirmação — só ignora silenciosamente. Quantidade/valor têm que ser número
    // válido pra não gravar lixo no estoque.
    const manuaisValidas = itensManuais.filter(i => i.descricao.trim() && Number(i.quantidade) > 0);
    const manuaisInvalidas = itensManuais.filter(i => i.descricao.trim() && !(Number(i.quantidade) > 0));
    if (manuaisInvalidas.length > 0) {
      setErro(`Informe uma quantidade válida (maior que zero) pra "${manuaisInvalidas[0].descricao}".`);
      return;
    }

    setSalvando(true); setErro(null);
    try {
      for (const item of itens) {
        if (item.escolha === 'ignorar') {
          await supabase.from('fiscal_notas_itens').update({ status: 'ignorado' }).eq('id', item.id);
          continue;
        }

        let servicoId: number;
        if (item.escolha === 'novo') {
          // unidade aqui é FILIAL/unidade de negócio, não unidade de medida — '' =
          // "Geral", visível pra empresa inteira.
          const { data: criado, error: erroCriar } = await supabase.from('servicos').insert([{
            nome: item.descricao, preco: item.valor_unitario, tipo: 'Nota Fiscal', unidade: '',
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

      // Item digitado na mão (nota sem XML disponível, ou complemento ao que veio do XML)
      // — primeiro grava a linha em fiscal_notas_itens (pra ficar no histórico igual às
      // lidas automático), só depois processa igual às outras.
      for (const item of manuaisValidas) {
        const quantidade = Number(item.quantidade);
        const valorUnitario = Number(item.valorUnitario) || 0;
        const { data: linhaCriada } = await supabase.from('fiscal_notas_itens').insert([{
          nota_id: notaId, descricao: item.descricao.trim(), quantidade, valor_unitario: valorUnitario,
          servico_id: typeof item.escolha === 'number' ? item.escolha : null, status: 'pendente',
        }]).select('id').single();
        if (!linhaCriada) continue;

        let servicoId: number;
        if (item.escolha === 'novo') {
          const { data: criado, error: erroCriar } = await supabase.from('servicos').insert([{
            nome: item.descricao.trim(), preco: valorUnitario, tipo: 'Nota Fiscal', unidade: '',
            estoque: quantidade, empresa_id: empresaId,
          }]).select('id').single();
          if (erroCriar || !criado) throw new Error(erroCriar?.message || `Erro ao criar produto "${item.descricao}".`);
          servicoId = criado.id;
        } else if (item.escolha === 'ignorar') {
          await supabase.from('fiscal_notas_itens').update({ status: 'ignorado' }).eq('id', linhaCriada.id);
          continue;
        } else {
          servicoId = item.escolha;
          const atual = servicos.find(s => s.id === servicoId);
          await supabase.from('servicos').update({ estoque: (atual?.estoque || 0) + quantidade }).eq('id', servicoId);
        }

        const { data: movimento } = await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: empresaId, servico_id: servicoId, quantidade,
          valor_unitario: valorUnitario, user_id: userId,
          tipo: 'entrada_nf', motivo: 'compra',
          observacao: 'Item digitado na mão (XML da NF-e não disponível).',
        }]).select('id').single();

        await supabase.from('fiscal_notas_itens').update({
          status: 'confirmado', servico_id: servicoId, estoque_movimentacao_id: movimento?.id ?? null,
        }).eq('id', linhaCriada.id);
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
        ) : (
          <div className="space-y-3">
            {itens.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-200 text-[11px] font-bold leading-snug">O casamento com o produto é uma sugestão automática por nome — confira cada item antes de confirmar, principalmente variações (medida, cor) que parecem iguais mas não são.</p>
              </div>
            )}
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

            {itens.length === 0 && itensManuais.length === 0 && (
              <p className="text-slate-500 text-xs text-center py-4">Essa nota ainda não teve o XML lido pela SEFAZ (ou nunca vai ter). Pode digitar os itens na mão abaixo se quiser dar entrada agora mesmo assim.</p>
            )}

            {itensManuais.length > 0 && (
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-1">Itens digitados na mão</p>
            )}
            {itensManuais.map(item => (
              <div key={item.chave} className="bg-black/30 border border-dashed border-white/15 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={item.descricao}
                    onChange={e => atualizarLinhaManual(item.chave, { descricao: e.target.value })}
                    placeholder="Descrição do produto"
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500"
                  />
                  <button onClick={() => removerLinhaManual(item.chave)} className="text-slate-500 hover:text-red-400 p-1 shrink-0"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number" min="0" step="any" value={item.quantidade}
                    onChange={e => atualizarLinhaManual(item.chave, { quantidade: e.target.value })}
                    placeholder="Quantidade"
                    className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500"
                  />
                  <input
                    type="number" min="0" step="any" value={item.valorUnitario}
                    onChange={e => atualizarLinhaManual(item.chave, { valorUnitario: e.target.value })}
                    placeholder="Valor unitário (R$)"
                    className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>
                {item.descricao.trim() && (
                  <select
                    value={String(item.escolha)}
                    onChange={e => atualizarLinhaManual(item.chave, { escolha: e.target.value === 'novo' || e.target.value === 'ignorar' ? e.target.value : Number(e.target.value) })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500"
                  >
                    <option value="novo" className="bg-[#0B1120]">+ Criar produto novo com esse nome</option>
                    <option value="ignorar" className="bg-[#0B1120]">Ignorar (não afeta estoque)</option>
                    {servicos.map(s => <option key={s.id} value={s.id} className="bg-[#0B1120]">{s.nome}</option>)}
                  </select>
                )}
              </div>
            ))}
            <button onClick={adicionarLinhaManual} className="w-full flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-dashed border-white/15 rounded-xl py-2.5 transition-colors">
              <Plus size={12} /> {itens.length > 0 || itensManuais.length > 0 ? 'Adicionar outro item na mão' : <><PenLine size={12} /> Digitar item na mão</>}
            </button>
          </div>
        )}

        {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl mt-3">{erro}</div>}

        {(itens.length > 0 || itensManuais.some(i => i.descricao.trim())) && (
          <button onClick={confirmar} disabled={salvando} className="w-full mt-4 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {salvando ? 'Confirmando...' : 'Confirmar itens e dar entrada'}
          </button>
        )}
      </div>
    </div>
  );
}
