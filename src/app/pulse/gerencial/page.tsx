"use client";
import { useState, useEffect, useMemo } from 'react';
import { Loader2, Activity, BarChart3, Wallet, ShoppingBag, TrendingUp, TrendingDown, Hammer, CheckCircle2, AlertTriangle, PackageCheck, Boxes, Clock, Factory, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig, VendaPulse, etapasFabricacaoDe } from '../shared';
import { calcularAlertasReposicao } from '@/lib/estoqueInteligente';

type Producao = {
  id: number; status: 'em_producao' | 'concluida' | 'entregue'; etapa_fabricacao_idx: number;
  custo_total: number; quantidade_produzida: number; created_at: string; previsao_entrega: string | null;
};
type EventoEntrega = { producao_id: number; created_at: string };
type MovimentoNf = { quantidade: number; valor_unitario: number | null };
type TopProduto = { nome: string; quantidade: number; valor: number; margem: number | null };

// Painel gerencial pra liderança analisar o negócio como um todo (vendas + produção +
// estoque) num só lugar — diferente do /pulse/producao/painel (wallboard de TV pro chão
// de fábrica, sem nenhum valor), esse aqui é pra análise, com custo/margem/faturamento.
export default function PainelGerencialPage() {
  const { authLoading, temPulse, isLideranca, perfil, empresa } = usePulseAccess();
  const ETAPAS_FABRICACAO = useMemo(() => etapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [vendas, setVendas] = useState<VendaPulse[]>([]);
  const [faturamentoMesAnterior, setFaturamentoMesAnterior] = useState(0);
  const [producoes, setProducoes] = useState<Producao[]>([]);
  const [entregas, setEntregas] = useState<EventoEntrega[]>([]);
  const [comprasMes, setComprasMes] = useState<MovimentoNf[]>([]);
  const [consumoRecente, setConsumoRecente] = useState<{ servico_id: number; quantidade: number; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id || !isLideranca) return;
    const carregar = async () => {
      setLoading(true);
      const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
      const inicioMesAnterior = new Date(inicioMes); inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
      const desde30d = new Date(); desde30d.setDate(desde30d.getDate() - 30);

      const [
        { data: servicosData }, { data: vendasData }, { data: vendasAnterioresData },
        { data: producoesData }, { data: entregasData }, { data: comprasData }, { data: consumoData },
      ] = await Promise.all([
        supabase.from('servicos').select('*'),
        supabase.from('leads').select('id, empresa, valor_total, created_at, user_id, status, itens')
          .eq('empresa_id', perfil.empresa_id).eq('tipo', 'Pulse').eq('status', 'ganho').gte('created_at', inicioMes.toISOString()),
        supabase.from('leads').select('valor_total')
          .eq('empresa_id', perfil.empresa_id).eq('tipo', 'Pulse').eq('status', 'ganho')
          .gte('created_at', inicioMesAnterior.toISOString()).lt('created_at', inicioMes.toISOString()),
        supabase.from('pulse_producoes').select('id, status, etapa_fabricacao_idx, custo_total, quantidade_produzida, created_at, previsao_entrega')
          .neq('status', 'entregue').order('created_at', { ascending: false }).limit(300),
        supabase.from('pulse_producao_eventos').select('producao_id, created_at')
          .eq('tipo', 'status').ilike('texto', '%Entregue%').gte('created_at', inicioMes.toISOString()),
        supabase.from('estoque_movimentacoes').select('quantidade, valor_unitario')
          .eq('empresa_id', perfil.empresa_id).eq('tipo', 'entrada_nf').gte('created_at', inicioMes.toISOString()),
        supabase.from('estoque_movimentacoes').select('servico_id, quantidade, created_at')
          .eq('empresa_id', perfil.empresa_id).lt('quantidade', 0).gte('created_at', desde30d.toISOString()),
      ]);

      if (servicosData) setServicos(servicosData as ServicoConfig[]);
      if (vendasData) setVendas(vendasData as VendaPulse[]);
      setFaturamentoMesAnterior((vendasAnterioresData || []).reduce((s, v) => s + (Number(v.valor_total) || 0), 0));
      if (producoesData) setProducoes(producoesData as Producao[]);
      if (entregasData) setEntregas(entregasData as EventoEntrega[]);
      if (comprasData) setComprasMes(comprasData as MovimentoNf[]);
      if (consumoData) setConsumoRecente(consumoData);
      setLoading(false);
    };
    carregar();
  }, [perfil?.empresa_id, isLideranca]);

  // --- Vendas ---
  const faturamentoMes = vendas.reduce((s, v) => s + (Number(v.valor_total) || 0), 0);
  const ticketMedio = vendas.length > 0 ? faturamentoMes / vendas.length : 0;
  const variacaoFaturamento = faturamentoMesAnterior > 0 ? ((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100 : null;

  const topProdutos: TopProduto[] = useMemo(() => {
    const acc: Record<string, { quantidade: number; valor: number }> = {};
    vendas.forEach(v => (v.itens || []).forEach(i => {
      if (!acc[i.servico]) acc[i.servico] = { quantidade: 0, valor: 0 };
      acc[i.servico].quantidade += i.quantidade;
      acc[i.servico].valor += i.quantidade * i.precoUnitario;
    }));
    const servicoPorNome = new Map(servicos.map(s => [s.nome, s]));
    return Object.entries(acc).map(([nome, v]) => {
      const s = servicoPorNome.get(nome);
      const margem = s?.preco_custo != null && s.preco > 0 ? ((s.preco - s.preco_custo) / s.preco) * 100 : null;
      return { nome, ...v, margem };
    }).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [vendas, servicos]);

  // --- Produção / Produtividade ---
  const emProducao = producoes.filter(p => p.status === 'em_producao');
  const aguardandoEntrega = producoes.filter(p => p.status === 'concluida');
  const atrasadas = producoes.filter(p => p.previsao_entrega && new Date(p.previsao_entrega) < new Date());
  const producaoPorId = useMemo(() => new Map(producoes.map(p => [p.id, p])), [producoes]);

  const custoProducaoMes = entregas.reduce((s, e) => s + (producaoPorId.get(e.producao_id)?.custo_total || 0), 0);

  const tempoMedioProducaoDias = useMemo(() => {
    const prazos = entregas.map(e => {
      const p = producaoPorId.get(e.producao_id);
      if (!p) return null;
      const dias = (new Date(e.created_at).getTime() - new Date(p.created_at).getTime()) / 86400000;
      return dias >= 0 ? dias : null;
    }).filter((d): d is number => d !== null);
    if (prazos.length === 0) return null;
    return prazos.reduce((s, d) => s + d, 0) / prazos.length;
  }, [entregas, producaoPorId]);

  const porEtapa = ETAPAS_FABRICACAO.map((nome, idx) => ({ nome, quantidade: emProducao.filter(p => p.etapa_fabricacao_idx === idx).length }));
  const maxEtapa = Math.max(1, ...porEtapa.map(e => e.quantidade));

  // --- Estoque ---
  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);
  const valorEstoqueTotal = produtosComEstoque.reduce((s, p) => s + (p.preco || 0) * (p.estoque || 0), 0);
  const itensEstoqueBaixo = produtosComEstoque.filter(s => (s.estoque as number) <= (s.estoque_minimo ?? 5)).sort((a, b) => (a.estoque as number) - (b.estoque as number));
  const alertasReposicao = calcularAlertasReposicao(servicos, consumoRecente);
  const comprasMesValor = comprasMes.reduce((s, m) => s + Math.abs(m.quantidade) * (m.valor_unitario || 0), 0);

  if (authLoading || loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

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

  if (!isLideranca) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <BarChart3 size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">Painel gerencial disponível só pra liderança.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
          <BarChart3 size={32} /> Painel Gerencial
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Vendas, produção e estoque — mês atual</p>
      </header>

      {/* Vendas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Wallet size={10} /> Faturamento do mês</p>
          <p className="text-2xl font-black text-[var(--cor-primaria)] mt-1">R$ {faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          {variacaoFaturamento != null && (
            <p className={`text-[10px] font-black mt-1 flex items-center gap-1 ${variacaoFaturamento >= 0 ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>
              {variacaoFaturamento >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />} {variacaoFaturamento >= 0 ? '+' : ''}{variacaoFaturamento.toFixed(0)}% vs mês passado
            </p>
          )}
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><ShoppingBag size={10} /> Pedidos fechados</p>
          <p className="text-2xl font-black text-white mt-1">{vendas.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Ticket médio</p>
          <p className="text-2xl font-black text-white mt-1">R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Boxes size={10} /> Valor em estoque</p>
          <p className="text-2xl font-black text-white mt-1">R$ {valorEstoqueTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
      </div>

      {/* Produção */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Hammer size={10} /> Em produção</p>
          <p className="text-2xl font-black text-white mt-1">{emProducao.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10} /> Aguardando entrega</p>
          <p className="text-2xl font-black text-white mt-1">{aguardandoEntrega.length}</p>
        </div>
        <div className={`bg-[#0F172A] border rounded-2xl p-4 ${atrasadas.length > 0 ? 'border-red-500/40' : 'border-white/10'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${atrasadas.length > 0 ? 'text-red-400' : 'text-slate-500'}`}><AlertTriangle size={10} /> Atrasadas</p>
          <p className={`text-2xl font-black mt-1 ${atrasadas.length > 0 ? 'text-red-400' : 'text-white'}`}>{atrasadas.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><PackageCheck size={10} /> Entregues no mês</p>
          <p className="text-2xl font-black text-white mt-1">{entregas.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1"><Clock size={10} /> Tempo médio de produção</p>
          <p className="text-2xl font-black text-white">{tempoMedioProducaoDias != null ? `${tempoMedioProducaoDias.toFixed(0)} dias` : '—'}</p>
          <p className="text-slate-600 text-[10px] font-bold mt-1">Da abertura até a entrega, nas concluídas este mês</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1"><Factory size={10} /> Custo de produção entregue</p>
          <p className="text-2xl font-black text-white">R$ {custoProducaoMes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          <p className="text-slate-600 text-[10px] font-bold mt-1">Custo de matéria-prima do que foi entregue no mês</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1"><Package size={10} /> Compras de matéria-prima</p>
          <p className="text-2xl font-black text-white">R$ {comprasMesValor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          <p className="text-slate-600 text-[10px] font-bold mt-1">Entradas por NF registradas este mês</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Gargalo por etapa */}
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
          <h3 className="font-black uppercase text-sm text-slate-300 mb-4">Gargalo de produção agora</h3>
          {porEtapa.every(e => e.quantidade === 0) ? (
            <p className="text-slate-600 text-sm font-bold py-6 text-center">Nada em produção no momento.</p>
          ) : (
            <div className="space-y-3">
              {porEtapa.map(e => (
                <div key={e.nome}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-xs font-bold uppercase">{e.nome}</span>
                    <span className="text-amber-400 font-black text-sm">{e.quantidade}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(e.quantidade / maxEtapa) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top produtos vendidos */}
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
          <h3 className="font-black uppercase text-sm text-slate-300 mb-4">Top produtos vendidos no mês</h3>
          {topProdutos.length === 0 ? (
            <p className="text-slate-600 text-sm font-bold py-6 text-center">Nenhuma venda com item este mês.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {topProdutos.map(p => (
                <div key={p.nome} className="flex items-center justify-between gap-3 bg-black/20 rounded-xl px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-xs truncate">{p.nome}</p>
                    <p className="text-slate-500 text-[10px]">{p.quantidade} un. {p.margem != null && `· margem ${p.margem.toFixed(0)}%`}</p>
                  </div>
                  <span className="text-[var(--cor-primaria)] font-black text-xs shrink-0">R$ {p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Estoque baixo */}
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
          <h3 className="font-black uppercase text-sm text-slate-300 mb-4">Itens com estoque baixo ({itensEstoqueBaixo.length})</h3>
          {itensEstoqueBaixo.length === 0 ? (
            <p className="text-slate-600 text-sm font-bold py-6 text-center">Nenhum item abaixo do mínimo. 🎉</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {itensEstoqueBaixo.slice(0, 10).map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <p className="text-white font-bold text-xs truncate">{s.nome}</p>
                  <span className="text-red-400 font-black text-xs shrink-0">{s.estoque} un.</span>
                </div>
              ))}
              {itensEstoqueBaixo.length > 10 && <p className="text-slate-600 text-[10px] text-center pt-1">+ {itensEstoqueBaixo.length - 10} outro(s).</p>}
            </div>
          )}
        </div>

        {/* Reposição inteligente */}
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
          <h3 className="font-black uppercase text-sm text-slate-300 mb-4">Reposição inteligente — vão zerar antes do prazo de repor</h3>
          {alertasReposicao.length === 0 ? (
            <p className="text-slate-600 text-sm font-bold py-6 text-center">Nenhum alerta no momento.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {alertasReposicao.slice(0, 10).map(a => (
                <div key={a.servicoId} className="flex items-center justify-between gap-3 bg-black/20 rounded-xl px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-xs truncate">{a.nome}</p>
                    <p className="text-slate-500 text-[10px]">{a.estoqueAtual} em estoque · consumindo ~{a.consumoDiario.toFixed(1)}/dia</p>
                  </div>
                  <span className={`shrink-0 text-xs font-black px-2 py-1 rounded ${a.diasRestantes <= a.limiarDias / 2 ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                    {Math.max(0, Math.floor(a.diasRestantes))}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
