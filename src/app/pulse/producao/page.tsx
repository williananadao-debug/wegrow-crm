"use client";
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Factory, Plus, Trash2, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig, alertarEstoqueBaixoSeCruzou } from '../shared';

type ItemProducao = { servicoId: number | ''; quantidade: string };
type Producao = {
  id: number; produto_final_nome: string; quantidade_produzida: number; custo_total: number; created_at: string;
};

// Ficha técnica simples: 1 produto final consome N matérias-primas de uma vez. Não é um
// MRP completo (sem múltiplos níveis de montagem, sem apontamento de mão de obra) — cobre
// o caso real de fábrica que falta hoje no Pulse (que só modela revenda 1:1).
function PulseProducaoContent() {
  const { authLoading, temPulse, user, perfil } = usePulseAccess();
  const searchParams = useSearchParams();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [producoes, setProducoes] = useState<Producao[]>([]);
  const [loading, setLoading] = useState(true);
  const [produtoFinalId, setProdutoFinalId] = useState<number | ''>('');
  const [quantidadeProduzida, setQuantidadeProduzida] = useState('');
  const [itens, setItens] = useState<ItemProducao[]>([{ servicoId: '', quantidade: '' }]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setLoading(true);
    const [{ data: servicosData }, { data: producoesData }] = await Promise.all([
      supabase.from('servicos').select('*').order('nome', { ascending: true }),
      supabase.from('pulse_producoes').select('id, produto_final_nome, quantidade_produzida, custo_total, created_at').order('created_at', { ascending: false }).limit(30),
    ]);
    if (servicosData) setServicos(servicosData as ServicoConfig[]);
    if (producoesData) setProducoes(producoesData as Producao[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  // Vem da Nova Venda ("Registrar produção" no pedido fechado) — pré-preenche o produto
  // final e a quantidade vendida, pra quem vai construir não ter que selecionar de novo.
  useEffect(() => {
    const produtoParam = searchParams.get('produtoFinalId');
    const qtdParam = searchParams.get('quantidade');
    if (produtoParam) setProdutoFinalId(Number(produtoParam));
    if (qtdParam) setQuantidadeProduzida(qtdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const servicoPorId = useMemo(() => new Map(servicos.map(s => [s.id, s])), [servicos]);

  const custoTotal = useMemo(() => itens.reduce((s, i) => {
    const servico = i.servicoId ? servicoPorId.get(i.servicoId as number) : null;
    const qtd = Number(i.quantidade) || 0;
    return s + qtd * (servico?.preco_custo || 0);
  }, 0), [itens, servicoPorId]);

  const adicionarLinha = () => setItens(prev => [...prev, { servicoId: '', quantidade: '' }]);
  const removerLinha = (idx: number) => setItens(prev => prev.filter((_, i) => i !== idx));
  const atualizarLinha = (idx: number, campo: 'servicoId' | 'quantidade', valor: any) =>
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));

  const registrarProducao = async () => {
    setErro('');
    const qtdProduzida = Number(quantidadeProduzida);
    const itensValidos = itens.filter(i => i.servicoId && Number(i.quantidade) > 0);
    if (!produtoFinalId) { setErro('Selecione o produto final.'); return; }
    if (!qtdProduzida) { setErro('Informe a quantidade produzida (maior que zero).'); return; }
    if (itensValidos.length === 0) { setErro('Adicione ao menos uma matéria-prima com quantidade maior que zero — selecione o item E preencha a quantidade em cada linha.'); return; }
    setSalvando(true);
    try {
      const custo = itensValidos.reduce((s, i) => s + Number(i.quantidade) * (servicoPorId.get(i.servicoId as number)?.preco_custo || 0), 0);
      const produtoFinal = servicoPorId.get(produtoFinalId as number);

      const { data: producao, error: errProd } = await supabase.from('pulse_producoes').insert([{
        empresa_id: perfil?.empresa_id, produto_final_id: produtoFinalId, produto_final_nome: produtoFinal?.nome || '',
        quantidade_produzida: qtdProduzida, custo_total: custo, user_id: user?.id,
      }]).select('id').single();
      if (errProd || !producao) throw new Error(errProd?.message || 'Erro ao registrar produção.');

      for (const item of itensValidos) {
        const servico = servicoPorId.get(item.servicoId as number)!;
        const qtd = Number(item.quantidade);
        const custoUnitario = servico.preco_custo || 0;
        await supabase.from('pulse_producao_itens').insert([{
          producao_id: producao.id, servico_id: servico.id, materia_prima_nome: servico.nome,
          quantidade: qtd, custo_unitario: custoUnitario, subtotal: qtd * custoUnitario,
        }]);
        const estoqueAtual = servico.estoque || 0;
        const novoEstoque = Math.max(0, estoqueAtual - qtd);
        await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', servico.id);
        await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: perfil?.empresa_id, servico_id: servico.id, quantidade: -(estoqueAtual - novoEstoque),
          tipo: 'consumo_producao', producao_id: producao.id, user_id: user?.id,
          observacao: `Consumido na produção de ${produtoFinal?.nome || 'produto'}`,
        }]);
        alertarEstoqueBaixoSeCruzou(servico.id, estoqueAtual, novoEstoque, servico.estoque_minimo ?? 5);
      }

      if (produtoFinal) {
        const novoEstoqueFinal = (produtoFinal.estoque || 0) + qtdProduzida;
        const novoCustoUnitario = custo / qtdProduzida;
        await supabase.from('servicos').update({ estoque: novoEstoqueFinal, preco_custo: novoCustoUnitario }).eq('id', produtoFinal.id);
        await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: perfil?.empresa_id, servico_id: produtoFinal.id, quantidade: qtdProduzida,
          tipo: 'producao', producao_id: producao.id, user_id: user?.id,
          observacao: `Produzido a partir de ${itensValidos.length} matéria(s)-prima(s)`,
        }]);
      }

      setProdutoFinalId(''); setQuantidadeProduzida(''); setItens([{ servicoId: '', quantidade: '' }]);
      carregar();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao registrar produção.');
    } finally {
      setSalvando(false);
    }
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Factory size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
          <Factory size={32} /> Produção
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Consome matéria-prima e gera o produto final, com custo calculado</p>
      </header>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5 mb-6">
        <p className="text-sm font-black uppercase text-slate-300 mb-4">Nova produção</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Produto final</label>
            <select value={produtoFinalId} onChange={e => setProdutoFinalId(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--cor-primaria)]">
              <option value="">Selecione...</option>
              {produtosComEstoque.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Quantidade produzida</label>
            <input type="number" value={quantidadeProduzida} onChange={e => setQuantidadeProduzida(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--cor-primaria)]" placeholder="1" />
          </div>
        </div>

        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Matérias-primas consumidas</p>
        <div className="space-y-2 mb-3">
          {itens.map((item, idx) => {
            const servico = item.servicoId ? servicoPorId.get(item.servicoId as number) : null;
            return (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select value={item.servicoId} onChange={e => atualizarLinha(idx, 'servicoId', e.target.value ? Number(e.target.value) : '')}
                  className="flex-1 min-w-[160px] bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--cor-primaria)]">
                  <option value="">Matéria-prima...</option>
                  {produtosComEstoque.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.estoque} em estoque)</option>)}
                </select>
                <input type="number" value={item.quantidade} onChange={e => atualizarLinha(idx, 'quantidade', e.target.value)}
                  className="w-24 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--cor-primaria)]" placeholder="Qtd" />
                {servico && <span className="text-[11px] text-slate-500 w-24 flex-shrink-0">R$ {((servico.preco_custo || 0) * (Number(item.quantidade) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                <button onClick={() => removerLinha(idx)} className="text-slate-500 hover:text-red-400 flex-shrink-0"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
        <button onClick={adicionarLinha} className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--cor-primaria)] mb-4">
          <Plus size={13} /> Adicionar matéria-prima
        </button>

        <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-xl px-4 py-3 mb-4">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Custo total estimado</span>
          <span className="text-lg font-black text-[var(--cor-primaria)]">R$ {custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>

        {erro && <p className="text-[12px] text-red-400 font-bold mb-3">{erro}</p>}

        <button onClick={registrarProducao} disabled={salvando}
          className="w-full bg-[var(--cor-primaria)] hover:bg-[#1ea34d] disabled:opacity-50 text-[#0B1120] py-3 rounded-xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Factory size={16} />} Registrar produção
        </button>
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center gap-2">
          <History size={15} className="text-slate-500" />
          <h3 className="font-black uppercase text-sm text-slate-300">Produções recentes</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : producoes.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-slate-500 text-sm font-bold">Nenhuma produção registrada ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {producoes.map(p => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-white font-bold text-sm">{p.produto_final_nome} <span className="text-slate-500 font-semibold">× {p.quantidade_produzida}</span></p>
                  <p className="text-slate-500 text-[10px]">{new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-[var(--cor-primaria)] font-black text-sm">R$ {p.custo_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-slate-500 text-[10px]">R$ {(p.custo_total / p.quantidade_produzida).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PulseProducaoPage() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>}>
      <PulseProducaoContent />
    </Suspense>
  );
}
