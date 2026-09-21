"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Activity, ListTree, ArrowLeft, Filter, X, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ordenarPorNome } from '@/lib/ordenacao';
import { usePulseAccess } from '../../usePulseAccess';
import { ServicoConfig, formatId } from '../../shared';

type Movimentacao = {
  id: number; servico_id: number; quantidade: number; valor_unitario: number | null;
  fornecedor: string | null; cnpj_participante: string | null;
  nf_numero: string | null; nf_serie: string | null; nf_chave_acesso: string | null;
  lead_id: number | null; destino?: string | null; requisicao_id?: string | null;
  created_at: string; tipo: string; motivo: string | null; observacao: string | null;
};

const TIPO_LABEL: Record<string, { label: string; cor: string }> = {
  entrada_nf: { label: 'NF entrada', cor: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  saida_nf: { label: 'NF saída', cor: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  ajuste: { label: 'Ajuste', cor: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  venda: { label: 'Venda', cor: 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)] border-transparent' },
  consumo_producao: { label: 'Produção', cor: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  estorno: { label: 'Estorno', cor: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

const MOTIVO_LABEL: Record<string, string> = {
  compra: 'Compra', devolucao_cliente: 'Devolução de cliente', transferencia: 'Transferência',
  contagem: 'Contagem física', outros: 'Outros', venda: 'Venda', perda: 'Perda/quebra',
  devolucao_fornecedor: 'Devolução ao fornecedor', uso_interno: 'Uso interno',
  retrabalho: 'Retrabalho', producao: 'Uso em produção/obra', amostra: 'Amostra/brinde',
};

const PERIODOS = [
  { id: '7d', label: '7 dias' }, { id: '30d', label: '30 dias' }, { id: '90d', label: '90 dias' }, { id: 'tudo', label: 'Tudo' },
] as const;

export default function KardexPage() {
  const { authLoading, temPulse, perfil } = usePulseAccess();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroProduto, setFiltroProduto] = useState<number | 'todos'>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState<typeof PERIODOS[number]['id']>('30d');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    Promise.all([
      supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).order('nome'),
      supabase.from('estoque_movimentacoes').select('*').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }).limit(1000),
    ]).then(([resServicos, resMov]) => {
      if (resServicos.data) setServicos(ordenarPorNome(resServicos.data as ServicoConfig[]));
      if (resMov.data) setMovimentacoes(resMov.data as Movimentacao[]);
      setLoading(false);
    });
  }, [perfil?.empresa_id]);

  const servicoPorId = useMemo(() => Object.fromEntries(servicos.map(s => [s.id, s])), [servicos]);

  const filtradas = useMemo(() => {
    const limite = filtroPeriodo === 'tudo' ? null : Date.now() - { '7d': 7, '30d': 30, '90d': 90 }[filtroPeriodo] * 86400000;
    return movimentacoes.filter(m => {
      if (limite && new Date(m.created_at).getTime() < limite) return false;
      if (filtroProduto !== 'todos' && m.servico_id !== filtroProduto) return false;
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (busca.trim()) {
        const alvo = busca.trim().toLowerCase();
        const nomeServico = servicoPorId[m.servico_id]?.nome?.toLowerCase() || '';
        const osTexto = m.lead_id ? formatId(m.lead_id).toLowerCase() : '';
        const matchTexto = nomeServico.includes(alvo) || (m.fornecedor || '').toLowerCase().includes(alvo) || (m.nf_numero || '').includes(alvo) || (m.observacao || '').toLowerCase().includes(alvo) || osTexto.includes(alvo);
        if (!matchTexto) return false;
      }
      return true;
    });
  }, [movimentacoes, filtroProduto, filtroTipo, filtroPeriodo, busca, servicoPorId]);

  const totais = useMemo(() => {
    const entradas = filtradas.filter(m => m.quantidade > 0);
    const saidas = filtradas.filter(m => m.quantidade < 0);
    const valorEntradas = entradas.reduce((s, m) => s + Math.abs(m.quantidade) * (m.valor_unitario || 0), 0);
    const valorSaidas = saidas.reduce((s, m) => s + Math.abs(m.quantidade) * (m.valor_unitario || 0), 0);
    return { qtdEntradas: entradas.length, qtdSaidas: saidas.length, valorEntradas, valorSaidas };
  }, [filtradas]);

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
            <ListTree size={28} /> Kardex
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Razão completo de entradas e saídas de estoque</p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={10} /> Entradas</p>
          <p className="text-xl font-black text-[var(--cor-primaria)] mt-1">{totais.qtdEntradas}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><TrendingDown size={10} /> Saídas</p>
          <p className="text-xl font-black text-red-400 mt-1">{totais.qtdSaidas}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Valor entrada</p>
          <p className="text-xl font-black text-white mt-1">R$ {totais.valorEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Valor saída</p>
          <p className="text-xl font-black text-white mt-1">R$ {totais.valorSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por produto, fornecedor/cliente, NF, OS da venda ou observação..." className="flex-1 bg-transparent outline-none text-white text-sm" />
          {busca && <button onClick={() => setBusca('')} className="text-slate-500 hover:text-white"><X size={14} /></button>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Filter size={11} /> Filtros:</span>
          <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value === 'todos' ? 'todos' : Number(e.target.value))} className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[var(--cor-primaria)]">
            <option value="todos" className="bg-[#0B1120]">Todos os produtos</option>
            {servicos.map(s => <option key={s.id} value={s.id} className="bg-[#0B1120]">{s.nome}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[var(--cor-primaria)]">
            <option value="todos" className="bg-[#0B1120]">Todos os tipos</option>
            {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k} className="bg-[#0B1120]">{v.label}</option>)}
          </select>
          <div className="flex gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setFiltroPeriodo(p.id)} className={`px-2.5 py-1 rounded text-[10px] font-black uppercase transition-all ${filtroPeriodo === p.id ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : filtradas.length === 0 ? (
          <div className="p-14 text-center">
            <ListTree size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhuma movimentação encontrada nesse filtro.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtradas.map(m => {
              const info = TIPO_LABEL[m.tipo] || { label: m.tipo, cor: 'text-slate-400 bg-white/5 border-white/10' };
              const positivo = m.quantidade >= 0;
              const servico = servicoPorId[m.servico_id];
              return (
                <div key={m.id} className="flex items-center gap-3 p-4">
                  <span className={`font-black text-sm w-16 text-right shrink-0 ${positivo ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>{positivo ? '+' : ''}{m.quantidade}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-white font-bold text-sm truncate">{servico?.nome || `Produto #${m.servico_id}`}</p>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${info.cor}`}>{info.label}</span>
                      {m.motivo && <span className="text-[8px] font-black bg-white/5 text-slate-500 px-1.5 py-0.5 rounded uppercase">{MOTIVO_LABEL[m.motivo] || m.motivo}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[10px] text-slate-500">
                      {m.fornecedor && <span className="text-slate-400 font-bold">{m.fornecedor}</span>}
                      {m.nf_numero && <span title={m.nf_chave_acesso || ''} className="text-purple-400 font-bold">NF {m.nf_numero}{m.nf_serie ? `/${m.nf_serie}` : ''}</span>}
                      {m.lead_id && <span className="text-[var(--cor-primaria)] font-bold">OS {formatId(m.lead_id)}</span>}
                      {m.valor_unitario != null && <span>R$ {m.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un</span>}
                      {m.destino && <span className="text-[8px] font-black bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded uppercase">→ {m.destino}</span>}
                      {m.requisicao_id && <span className="text-[8px] font-black bg-white/5 text-slate-500 px-1.5 py-0.5 rounded uppercase font-mono" title="Requisição de saída">REQ {m.requisicao_id.slice(0, 8)}</span>}
                      {m.observacao && <span className="italic">{m.observacao}</span>}
                    </div>
                  </div>
                  <span className="text-slate-600 text-[10px] shrink-0">{new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!loading && movimentacoes.length >= 1000 && (
        <p className="text-slate-600 text-[10px] text-center mt-3">Mostrando as 1000 movimentações mais recentes — refine os filtros pra achar algo mais antigo.</p>
      )}
    </div>
  );
}
