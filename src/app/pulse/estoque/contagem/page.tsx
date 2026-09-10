"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Activity, ClipboardCheck, ArrowLeft, Search, X, Check, AlertTriangle, History, PlayCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';

type ItemContagem = {
  id: number; servico_id: number | null; nome_produto: string;
  estoque_sistema: number; estoque_contado: number | null;
  contado_em: string | null;
};

type ContagemResumo = {
  id: number; status: string; observacao: string | null;
  concluido_em: string | null; created_at: string;
};

// Debounce simples pra não salvar a cada tecla digitada — espera a pessoa parar de
// digitar por um instante antes de gravar no banco.
function useDebounce<T>(valor: T, ms: number) {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return debounced;
}

export default function ContagemEstoquePage() {
  const { authLoading, temPulse, perfil, user } = usePulseAccess();

  const [contagemAtiva, setContagemAtiva] = useState<ContagemResumo | null>(null);
  const [historico, setHistorico] = useState<ContagemResumo[]>([]);
  const [itens, setItens] = useState<ItemContagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);
  const [soDivergentes, setSoDivergentes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const { data: contagens } = await supabase.from('pulse_contagens').select('*')
      .eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }).limit(30);
    const ativa = (contagens || []).find(c => c.status === 'em_andamento') || null;
    setContagemAtiva(ativa);
    setHistorico((contagens || []).filter(c => c.status !== 'em_andamento'));

    if (ativa) {
      const { data: itensData } = await supabase.from('pulse_contagens_itens').select('*')
        .eq('contagem_id', ativa.id).order('nome_produto');
      setItens(itensData || []);
    } else {
      setItens([]);
    }
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const iniciarContagem = async () => {
    if (!perfil?.empresa_id) return;
    setIniciando(true); setErro(null);
    try {
      const { data: servicos, error: erroServicos } = await supabase.from('servicos')
        .select('id, nome, estoque').eq('empresa_id', perfil.empresa_id).not('estoque', 'is', null);
      if (erroServicos) throw erroServicos;
      if (!servicos || servicos.length === 0) { setErro('Nenhum produto com estoque controlado pra contar.'); return; }

      const { data: contagem, error: erroContagem } = await supabase.from('pulse_contagens').insert([{
        empresa_id: perfil.empresa_id, status: 'em_andamento', iniciado_por: user?.id,
      }]).select('id').single();
      if (erroContagem || !contagem) throw new Error(erroContagem?.message || 'Erro ao iniciar contagem.');

      await supabase.from('pulse_contagens_itens').insert(
        servicos.map(s => ({ contagem_id: contagem.id, servico_id: s.id, nome_produto: s.nome, estoque_sistema: s.estoque || 0 }))
      );
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao iniciar contagem.');
    } finally {
      setIniciando(false);
    }
  };

  const salvarContagemItem = async (itemId: number, valor: number | null) => {
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, estoque_contado: valor } : i));
    await supabase.from('pulse_contagens_itens').update({
      estoque_contado: valor, contado_em: valor !== null ? new Date().toISOString() : null, contado_por: user?.id,
    }).eq('id', itemId);
  };

  const divergencias = useMemo(() => itens.filter(i => i.estoque_contado !== null && i.estoque_contado !== i.estoque_sistema), [itens]);
  const contados = useMemo(() => itens.filter(i => i.estoque_contado !== null), [itens]);

  const concluirContagem = async () => {
    if (!contagemAtiva || !perfil?.empresa_id) return;
    setConcluindo(true); setErro(null);
    try {
      for (const item of divergencias) {
        if (!item.servico_id || item.estoque_contado === null) continue;
        const diferenca = item.estoque_contado - item.estoque_sistema;
        const { data: movimento } = await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: perfil.empresa_id, servico_id: item.servico_id, quantidade: diferenca,
          tipo: 'ajuste', motivo: 'contagem', user_id: user?.id,
          observacao: `Contagem física #${contagemAtiva.id} — sistema tinha ${item.estoque_sistema}, contado ${item.estoque_contado}.`,
        }]).select('id').single();
        await supabase.from('servicos').update({ estoque: item.estoque_contado }).eq('id', item.servico_id);
        if (movimento) await supabase.from('pulse_contagens_itens').update({ estoque_movimentacao_id: movimento.id }).eq('id', item.id);
      }
      await supabase.from('pulse_contagens').update({
        status: 'concluida', concluido_em: new Date().toISOString(), concluido_por: user?.id,
      }).eq('id', contagemAtiva.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao concluir contagem.');
    } finally {
      setConcluindo(false);
    }
  };

  const itensFiltrados = useMemo(() => {
    return itens.filter(i => {
      if (soPendentes && i.estoque_contado !== null) return false;
      if (soDivergentes && (i.estoque_contado === null || i.estoque_contado === i.estoque_sistema)) return false;
      if (busca.trim() && !i.nome_produto.toLowerCase().includes(busca.trim().toLowerCase())) return false;
      return true;
    });
  }, [itens, busca, soPendentes, soDivergentes]);

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
      <header className="mb-6 flex items-center gap-4">
        <Link href="/pulse/estoque" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
          <ArrowLeft size={16} className="text-slate-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <ClipboardCheck size={28} /> Contagem de Estoque
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Bate o sistema com o que tem de verdade no galpão</p>
        </div>
      </header>

      {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl mb-4">{erro}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : !contagemAtiva ? (
        <div className="space-y-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-8 text-center">
            <ClipboardCheck size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-bold mb-4">Nenhuma contagem em andamento. Ao iniciar, o sistema tira uma foto do estoque atual de cada produto — você vai preenchendo o que contou fisicamente, no seu ritmo.</p>
            <button onClick={iniciarContagem} disabled={iniciando} className="inline-flex items-center gap-2 bg-[var(--cor-primaria)] hover:opacity-90 disabled:opacity-50 text-[#0B1120] px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
              {iniciando ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />} Iniciar nova contagem
            </button>
          </div>

          {historico.length > 0 && (
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center gap-2">
                <History size={14} className="text-slate-500" />
                <h3 className="font-black uppercase text-xs text-slate-400 tracking-widest">Histórico</h3>
              </div>
              <div className="divide-y divide-white/5">
                {historico.map(c => (
                  <div key={c.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-white font-bold text-sm">Contagem #{c.id}</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">{c.status === 'cancelada' ? 'Cancelada' : 'Concluída'} em {c.concluido_em ? new Date(c.concluido_em).toLocaleDateString('pt-BR') : '—'}</p>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-1 rounded uppercase ${c.status === 'cancelada' ? 'text-slate-500 bg-white/5' : 'text-emerald-400 bg-emerald-500/10'}`}>{c.status === 'cancelada' ? 'Cancelada' : 'Concluída'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Produtos</p>
              <p className="text-2xl font-black text-white mt-1">{itens.length}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Já contados</p>
              <p className="text-2xl font-black text-[var(--cor-primaria)] mt-1">{contados.length}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={10} /> Com diferença</p>
              <p className={`text-2xl font-black mt-1 ${divergencias.length > 0 ? 'text-amber-400' : 'text-white'}`}>{divergencias.length}</p>
            </div>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
              <Search size={14} className="text-slate-500 flex-shrink-0" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..." className="flex-1 bg-transparent outline-none text-white text-sm" />
              {busca && <button onClick={() => setBusca('')} className="text-slate-500 hover:text-white"><X size={14} /></button>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSoPendentes(v => !v)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${soPendentes ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'bg-black/30 text-slate-400 border border-white/10'}`}>Só pendentes</button>
              <button onClick={() => setSoDivergentes(v => !v)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${soDivergentes ? 'bg-amber-500 text-[#0B1120]' : 'bg-black/30 text-slate-400 border border-white/10'}`}>Só com diferença</button>
            </div>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
            {itensFiltrados.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-10">Nenhum produto nesse filtro.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {itensFiltrados.map(item => <LinhaContagem key={item.id} item={item} onSalvar={salvarContagemItem} />)}
              </div>
            )}
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4">
            <p className="text-slate-500 text-xs font-bold">
              {contados.length < itens.length
                ? `Faltam ${itens.length - contados.length} produto(s) contar. Pode concluir mesmo com pendência — o que não foi contado mantém o estoque do sistema.`
                : 'Todos os produtos foram contados.'}
            </p>
            <button onClick={concluirContagem} disabled={concluindo} className="shrink-0 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
              {concluindo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Concluir contagem
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaContagem({ item, onSalvar }: { item: ItemContagem; onSalvar: (id: number, valor: number | null) => void }) {
  const [texto, setTexto] = useState(item.estoque_contado !== null ? String(item.estoque_contado) : '');
  const debounced = useDebounce(texto, 600);

  useEffect(() => {
    const valor = debounced.trim() === '' ? null : Number(debounced);
    if (valor !== null && (isNaN(valor) || valor < 0)) return;
    if (valor === item.estoque_contado) return;
    onSalvar(item.id, valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const contado = texto.trim() !== '' && !isNaN(Number(texto));
  const diferenca = contado ? Number(texto) - item.estoque_sistema : 0;

  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm truncate">{item.nome_produto}</p>
        <p className="text-slate-500 text-[10px]">Sistema: {item.estoque_sistema}</p>
      </div>
      <input
        type="number" min="0" step="any" value={texto} onChange={e => setTexto(e.target.value)}
        placeholder="Contado"
        className="w-24 bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white text-right outline-none focus:border-[var(--cor-primaria)]"
      />
      <span className={`w-16 text-right text-xs font-black shrink-0 ${!contado ? 'text-slate-600' : diferenca === 0 ? 'text-emerald-400' : diferenca > 0 ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>
        {!contado ? '—' : diferenca === 0 ? 'OK' : `${diferenca > 0 ? '+' : ''}${diferenca}`}
      </span>
    </div>
  );
}
