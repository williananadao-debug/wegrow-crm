"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Activity, LayoutGrid, ShoppingBag, BarChart3, Users, Printer, FileText, ExternalLink, CheckCircle2, X, Navigation, Plus, Boxes, Undo2, Wallet, TrendingDown, Hammer, AlertTriangle, PackageCheck, Clock, Factory, Package, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from './usePulseAccess';
import { VendaPulse, ServicoConfig, RankingItem, FORMAS_PAGAMENTO, formatId, getLocalYYYYMMDD, formatCompact, imprimirReciboOuOrcamento, alertarEstoqueBaixoSeCruzou, etapasFabricacaoDe } from './shared';
import { calcularAlertasReposicao } from '@/lib/estoqueInteligente';

type ProducaoGerencial = {
  id: number; status: 'em_producao' | 'concluida' | 'entregue'; etapa_fabricacao_idx: number;
  custo_total: number; quantidade_produzida: number; created_at: string; previsao_entrega: string | null;
};
type EventoEntregaGerencial = { producao_id: number; created_at: string };
type MovimentoNfGerencial = { quantidade: number; valor_unitario: number | null };

export default function PulsePainelPage() {
  const { authLoading, perfil, user, unidades, isLideranca, usersMap, temPulse, empresa, temCRM, vendaDiretaPulse } = usePulseAccess();
  const ETAPAS_FABRICACAO = etapasFabricacaoDe(empresa?.modulos);

  const [vendas, setVendas] = useState<VendaPulse[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(true);
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);

  // --- Aba Gerencial (vendas + produção + estoque, só liderança) ---
  const [abaPainel, setAbaPainel] = useState<'vendas' | 'gerencial'>('vendas');
  const [faturamentoMesAnterior, setFaturamentoMesAnterior] = useState(0);
  const [producoesGerencial, setProducoesGerencial] = useState<ProducaoGerencial[]>([]);
  const [entregasGerencial, setEntregasGerencial] = useState<EventoEntregaGerencial[]>([]);
  const [comprasMesGerencial, setComprasMesGerencial] = useState<MovimentoNfGerencial[]>([]);
  const [consumoRecenteGerencial, setConsumoRecenteGerencial] = useState<{ servico_id: number; quantidade: number; created_at: string }[]>([]);
  const [loadingGerencial, setLoadingGerencial] = useState(true);

  const [nfseVenda, setNfseVenda] = useState<VendaPulse | null>(null);
  const [nfseCpfCnpj, setNfseCpfCnpj] = useState('');
  const [nfseLoading, setNfseLoading] = useState(false);
  const [nfseErro, setNfseErro] = useState<string | null>(null);

  const [estornoVenda, setEstornoVenda] = useState<VendaPulse | null>(null);
  const [estornoMotivo, setEstornoMotivo] = useState('');
  const [estornoLoading, setEstornoLoading] = useState(false);
  const [estornoErro, setEstornoErro] = useState<string | null>(null);

  const fetchVendas = async () => {
    if (!perfil?.empresa_id) return;
    setLoadingVendas(true);
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    let q = supabase.from('leads')
      .select('id, empresa, valor_total, created_at, forma_pagamento, cnpj, nfse_invoice_id, nfse_pdf_url, user_id, status, itens, estornado_em, estornado_motivo')
      .eq('empresa_id', perfil.empresa_id)
      .gte('created_at', inicioMes.toISOString())
      .order('created_at', { ascending: false });
    if (!temCRM) q = q.eq('tipo', 'Pulse');
    const { data } = await q;
    if (data) setVendas(data as VendaPulse[]);
    setLoadingVendas(false);
  };

  const fetchServicos = async () => {
    const { data } = await supabase.from('servicos').select('*');
    if (data) setServicos(data as ServicoConfig[]);
  };

  useEffect(() => { if (perfil?.empresa_id) { fetchVendas(); fetchServicos(); } }, [perfil?.empresa_id]);

  // Dados extras só pra aba Gerencial — carrega junto (não é pesado), mas só se a pessoa
  // é liderança, já que ninguém mais vai ver essa aba.
  useEffect(() => {
    if (!perfil?.empresa_id || !isLideranca) { setLoadingGerencial(false); return; }
    const carregar = async () => {
      setLoadingGerencial(true);
      const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
      const inicioMesAnterior = new Date(inicioMes); inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
      const desde30d = new Date(); desde30d.setDate(desde30d.getDate() - 30);

      const [{ data: vendasAnterioresData }, { data: producoesData }, { data: entregasData }, { data: comprasData }, { data: consumoData }] = await Promise.all([
        (() => {
          let qa = supabase.from('leads').select('valor_total')
            .eq('empresa_id', perfil.empresa_id).eq('status', 'ganho')
            .gte('created_at', inicioMesAnterior.toISOString()).lt('created_at', inicioMes.toISOString());
          if (!temCRM) qa = qa.eq('tipo', 'Pulse');
          return qa;
        })(),
        supabase.from('pulse_producoes').select('id, status, etapa_fabricacao_idx, custo_total, quantidade_produzida, created_at, previsao_entrega')
          .neq('status', 'entregue').order('created_at', { ascending: false }).limit(300),
        supabase.from('pulse_producao_eventos').select('producao_id, created_at')
          .eq('tipo', 'status').ilike('texto', '%Entregue%').gte('created_at', inicioMes.toISOString()),
        supabase.from('estoque_movimentacoes').select('quantidade, valor_unitario')
          .eq('empresa_id', perfil.empresa_id).eq('tipo', 'entrada_nf').gte('created_at', inicioMes.toISOString()),
        supabase.from('estoque_movimentacoes').select('servico_id, quantidade, created_at')
          .eq('empresa_id', perfil.empresa_id).lt('quantidade', 0).gte('created_at', desde30d.toISOString()),
      ]);

      setFaturamentoMesAnterior((vendasAnterioresData || []).reduce((s, v) => s + (Number(v.valor_total) || 0), 0));
      if (producoesData) setProducoesGerencial(producoesData as ProducaoGerencial[]);
      if (entregasData) setEntregasGerencial(entregasData as EventoEntregaGerencial[]);
      if (comprasData) setComprasMesGerencial(comprasData as MovimentoNfGerencial[]);
      if (consumoData) setConsumoRecenteGerencial(consumoData);
      setLoadingGerencial(false);
    };
    carregar();
  }, [perfil?.empresa_id, isLideranca]);

  const produtosEstoqueBaixo = servicos.filter(s => s.estoque !== null && s.estoque !== undefined && (s.estoque as number) <= (s.estoque_minimo ?? 5));
  const pedidosFechados = vendas.filter(v => v.status === 'ganho');
  const orcamentosAbertos = vendas.filter(v => v.status === 'orcamento');
  const vendasEstornadas = vendas.filter(v => v.estornado_em);

  const hojeStr = new Date().toDateString();
  const vendasHoje = pedidosFechados.filter(v => new Date(v.created_at).toDateString() === hojeStr);
  const faturamentoHoje = vendasHoje.reduce((acc, v) => acc + (v.valor_total || 0), 0);
  const faturamentoMes = pedidosFechados.reduce((acc, v) => acc + (v.valor_total || 0), 0);

  const vendasPorDia = (() => {
    const inicio = new Date(); inicio.setDate(1); inicio.setHours(0, 0, 0, 0);
    const hoje = new Date();
    const dias: { dia: string; valor: number; dataIso: string }[] = [];
    for (let d = new Date(inicio); d <= hoje; d.setDate(d.getDate() + 1)) {
      dias.push({ dia: String(d.getDate()).padStart(2, '0'), valor: 0, dataIso: getLocalYYYYMMDD(d) });
    }
    pedidosFechados.forEach(v => {
      const iso = v.created_at.substring(0, 10);
      const slot = dias.find(d => d.dataIso === iso);
      if (slot) slot.valor += (Number(v.valor_total) || 0);
    });
    return dias;
  })();

  const ranking: RankingItem[] = (() => {
    const acc: Record<string, RankingItem> = {};
    pedidosFechados.forEach(v => {
      const chave = v.user_id || 'sem_dono';
      if (!acc[chave]) acc[chave] = { id: chave, nome: usersMap[chave] || 'Sem vendedor', count: 0, total: 0 };
      acc[chave].count += 1;
      acc[chave].total += (Number(v.valor_total) || 0);
    });
    return Object.values(acc).sort((a, b) => b.total - a.total);
  })();

  // --- Cálculos da aba Gerencial ---
  const ticketMedio = pedidosFechados.length > 0 ? faturamentoMes / pedidosFechados.length : 0;
  const variacaoFaturamento = faturamentoMesAnterior > 0 ? ((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100 : null;

  const topProdutos = (() => {
    const acc: Record<string, { quantidade: number; valor: number }> = {};
    pedidosFechados.forEach(v => (v.itens || []).forEach(i => {
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
  })();

  const emProducaoGerencial = producoesGerencial.filter(p => p.status === 'em_producao');
  const aguardandoEntregaGerencial = producoesGerencial.filter(p => p.status === 'concluida');
  const atrasadasGerencial = producoesGerencial.filter(p => p.previsao_entrega && new Date(p.previsao_entrega) < new Date());
  const producaoPorIdGerencial = new Map(producoesGerencial.map(p => [p.id, p]));

  const custoProducaoMesGerencial = entregasGerencial.reduce((s, e) => s + (producaoPorIdGerencial.get(e.producao_id)?.custo_total || 0), 0);

  const tempoMedioProducaoDiasGerencial = (() => {
    const prazos = entregasGerencial.map(e => {
      const p = producaoPorIdGerencial.get(e.producao_id);
      if (!p) return null;
      const dias = (new Date(e.created_at).getTime() - new Date(p.created_at).getTime()) / 86400000;
      return dias >= 0 ? dias : null;
    }).filter((d): d is number => d !== null);
    if (prazos.length === 0) return null;
    return prazos.reduce((s, d) => s + d, 0) / prazos.length;
  })();

  const porEtapaGerencial = ETAPAS_FABRICACAO.map((nome, idx) => ({ nome, quantidade: emProducaoGerencial.filter(p => p.etapa_fabricacao_idx === idx).length }));
  const maxEtapaGerencial = Math.max(1, ...porEtapaGerencial.map(e => e.quantidade));

  const produtosComEstoqueGerencial = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);
  const valorEstoqueTotalGerencial = produtosComEstoqueGerencial.reduce((s, p) => s + (p.preco || 0) * (p.estoque || 0), 0);
  const itensEstoqueBaixoGerencial = [...produtosComEstoqueGerencial].filter(s => (s.estoque as number) <= (s.estoque_minimo ?? 5)).sort((a, b) => (a.estoque as number) - (b.estoque as number));
  const alertasReposicaoGerencial = calcularAlertasReposicao(servicos, consumoRecenteGerencial);
  const comprasMesValorGerencial = comprasMesGerencial.reduce((s, m) => s + Math.abs(m.quantidade) * (m.valor_unitario || 0), 0);

  const converterEmPedido = async (orc: VendaPulse) => {
    // fechado_por carimba quem fica com o crédito da venda em /goals — orc.user_id é o
    // dono do orçamento; cai pro usuário logado só se por algum motivo vier sem dono.
    const { error } = await supabase.from('leads').update({ status: 'ganho', etapa: 4, fechado_por: orc.user_id || user?.id || null }).eq('id', orc.id);
    if (error) { alert('Erro ao converter: ' + error.message); return; }
    const itens = orc.itens || [];
    await Promise.all([
      supabase.from('lancamentos').insert([{
        titulo: `VENDA RÁPIDA: ${orc.empresa} - OS: ${formatId(orc.id)}`,
        valor: orc.valor_total, tipo: 'entrada', categoria: 'vendas', status: 'pendente',
        data_vencimento: new Date().toISOString().split('T')[0],
        user_id: user?.id, empresa_id: perfil?.empresa_id,
      }]),
      // Mesmo motivo do nova-venda: orçamento virando pedido é venda fechada, mas nunca passou
      // por /visitas — sem isso o lead ganho fica sem visita associada.
      supabase.from('visitas').insert([{
        empresa: orc.empresa, observacao: `Venda Pulse — OS ${formatId(orc.id)}`,
        user_id: orc.user_id || user?.id, empresa_id: perfil?.empresa_id, unidade: perfil?.unidade || null,
        lead_id: orc.id,
      }]),
      ...itens.flatMap(item => {
        const s = servicos.find(x => x.nome === item.servico);
        if (!s || s.estoque === null || s.estoque === undefined) return [];
        const novo = Math.max(0, s.estoque - item.quantidade);
        const deltaReal = novo - s.estoque;
        alertarEstoqueBaixoSeCruzou(s.id, s.estoque, novo, s.estoque_minimo ?? 5);
        return [
          supabase.from('servicos').update({ estoque: novo }).eq('id', s.id),
          supabase.from('estoque_movimentacoes').insert([{
            empresa_id: perfil?.empresa_id, servico_id: s.id, quantidade: deltaReal,
            tipo: 'venda', observacao: `Venda Pulse — OS ${formatId(orc.id)}`, user_id: user?.id,
          }]),
        ];
      }),
    ]);
    fetchVendas(); fetchServicos();
  };

  const abrirEstorno = (venda: VendaPulse) => { setEstornoVenda(venda); setEstornoMotivo(''); setEstornoErro(null); };

  const confirmarEstorno = async () => {
    if (!estornoVenda) return;
    setEstornoLoading(true); setEstornoErro(null);
    try {
      const { error: erroLead } = await supabase.from('leads').update({
        status: 'perdido',
        estornado_em: new Date().toISOString(),
        estornado_motivo: estornoMotivo.trim() || null,
        estornado_por: user?.id,
      }).eq('id', estornoVenda.id);
      if (erroLead) throw new Error(erroLead.message);

      // Devolve exatamente o que a venda tirou do estoque (movimentações 'venda' ligadas ao
      // lead) — funciona igual pra venda do Pulse e pra venda fechada no CRM, e não devolve
      // nada de venda antiga que nunca baixou estoque. Só cai no casamento por nome do item
      // (comportamento antigo) em empresa só-Pulse, pra vendas anteriores ao vínculo lead_id.
      const { data: movsVenda } = await supabase.from('estoque_movimentacoes')
        .select('servico_id, quantidade').eq('lead_id', estornoVenda.id).eq('tipo', 'venda');
      const devolucoes: { servicoId: number; quantidade: number }[] = (movsVenda || []).length > 0
        ? (movsVenda || []).map(m => ({ servicoId: m.servico_id, quantidade: Math.abs(Number(m.quantidade) || 0) }))
        : temCRM ? [] : (estornoVenda.itens || []).flatMap(item => {
            const s = servicos.find(x => x.nome === item.servico);
            return s && s.estoque !== null && s.estoque !== undefined ? [{ servicoId: s.id, quantidade: item.quantidade }] : [];
          });
      const porServico = new Map<number, number>();
      devolucoes.forEach(d => porServico.set(d.servicoId, (porServico.get(d.servicoId) || 0) + d.quantidade));

      await Promise.all([
        // Reversão do lançamento — nunca apaga o registro original, lança uma saída
        // compensatória em espelho, igual se faz em qualquer estorno contábil de verdade.
        supabase.from('lancamentos').insert([{
          titulo: `ESTORNO: ${estornoVenda.empresa} - OS: ${formatId(estornoVenda.id)}`,
          valor: estornoVenda.valor_total, tipo: 'saida', categoria: 'Estorno', status: 'pendente',
          data_vencimento: new Date().toISOString().split('T')[0],
          user_id: user?.id, empresa_id: perfil?.empresa_id,
        }]),
        ...[...porServico.entries()].flatMap(([servicoId, quantidade]) => {
          const s = servicos.find(x => x.id === servicoId);
          if (!s || quantidade <= 0) return [];
          return [
            supabase.from('servicos').update({ estoque: (s.estoque || 0) + quantidade }).eq('id', servicoId),
            supabase.from('estoque_movimentacoes').insert([{
              empresa_id: perfil?.empresa_id, servico_id: servicoId, quantidade, lead_id: estornoVenda.id,
              tipo: 'estorno', observacao: estornoMotivo.trim() || `Estorno — OS ${formatId(estornoVenda.id)}`, user_id: user?.id,
            }]),
          ];
        }),
      ]);

      setEstornoVenda(null);
      fetchVendas(); fetchServicos();
    } catch (err: any) {
      setEstornoErro(err?.message || 'Erro ao estornar venda.');
    } finally {
      setEstornoLoading(false);
    }
  };

  const abrirNfse = (venda: VendaPulse) => { setNfseVenda(venda); setNfseCpfCnpj(venda.cnpj || ''); setNfseErro(null); };

  const emitirNfse = async () => {
    if (!nfseVenda) return;
    setNfseLoading(true); setNfseErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/financeiro/nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          empresaId: perfil?.empresa_id, nome: nfseVenda.empresa, cpfCnpj: nfseCpfCnpj,
          valor: nfseVenda.valor_total, dataEfetiva: new Date().toISOString().substring(0, 10), leadId: nfseVenda.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao emitir nota fiscal.');
      setVendas(prev => prev.map(v => v.id === nfseVenda.id ? { ...v, nfse_invoice_id: json.invoiceId, nfse_pdf_url: json.pdfUrl } : v));
      setNfseVenda(null);
    } catch (err: any) {
      setNfseErro(err?.message || 'Erro ao emitir nota fiscal.');
    } finally {
      setNfseLoading(false);
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
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <LayoutGrid size={32} /> Painel Pulse
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Vendas sem funil — feche na hora, acompanhe aqui</p>
        </div>
        <div className="flex gap-2">
          {vendaDiretaPulse && (
            <Link href="/pulse/nova-venda" className="inline-flex items-center gap-2 bg-[var(--cor-primaria)] text-[#0B1120] hover:scale-105 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
              <Plus size={14} /> Nova Venda
            </Link>
          )}
          <Link href="/visitas" className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Navigation size={14} /> Rota do Dia
          </Link>
        </div>
      </header>

      {isLideranca && (
        <div className="flex gap-1 bg-black/30 border border-white/10 rounded-xl p-1 mb-6 w-fit">
          <button onClick={() => setAbaPainel('vendas')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${abaPainel === 'vendas' ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
            Vendas
          </button>
          <button onClick={() => setAbaPainel('gerencial')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${abaPainel === 'gerencial' ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
            <BarChart3 size={12} /> Gerencial
          </button>
        </div>
      )}

      {abaPainel === 'vendas' && (
      <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Vendas hoje</p>
          <p className="text-2xl font-black text-white mt-1">{vendasHoje.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Faturamento hoje</p>
          <p className="text-2xl font-black text-[var(--cor-primaria)] mt-1">R$ {faturamentoHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Faturamento do mês</p>
          <p className="text-2xl font-black text-white mt-1">R$ {faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
        <Link href="/pulse/estoque" className="bg-[#0F172A] border border-white/10 hover:border-red-500/30 rounded-2xl p-4 text-left transition-all">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Estoque baixo</p>
          <p className={`text-2xl font-black mt-1 ${produtosEstoqueBaixo.length > 0 ? 'text-red-400' : 'text-white'}`}>{produtosEstoqueBaixo.length}</p>
        </Link>
      </div>

      <div className={`grid grid-cols-1 ${ranking.length > 1 ? 'lg:grid-cols-3' : ''} gap-4 mb-6`}>
        <div className={`bg-[#0F172A] border border-white/10 rounded-2xl p-4 ${ranking.length > 1 ? 'lg:col-span-2' : ''}`}>
          <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-amber-500" /> Vendas por Dia
          </h3>
          <div className="flex items-end h-36 gap-1 overflow-x-auto pb-1 w-full pt-4">
            {(() => {
              const hojeIso = getLocalYYYYMMDD(new Date());
              const maxVal = Math.max(...vendasPorDia.map(v => v.valor), 1);
              return vendasPorDia.map((d, i) => {
                const height = d.valor > 0 ? Math.max((d.valor / maxVal) * 100, 5) : 0;
                const isHoje = d.dataIso === hojeIso;
                return (
                  <div key={i} className="flex-1 min-w-[24px] group flex flex-col justify-end h-full relative hover:bg-white/5 rounded-lg transition-colors p-0.5">
                    <div
                      className={`w-full rounded-t-sm relative ${isHoje ? 'bg-[var(--cor-primaria)] shadow-[0_0_15px_rgb(var(--cor-primaria-rgb)/40%)]' : d.valor > 0 ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-white/5'}`}
                      style={{ height: d.valor > 0 ? `${height}%` : '4px' }}
                    >
                      {d.valor > 0 && (
                        <span className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-tighter whitespace-nowrap z-10 ${isHoje ? 'text-[var(--cor-primaria)]' : 'text-amber-500'}`}>
                          {formatCompact(d.valor)}
                        </span>
                      )}
                    </div>
                    <span className={`text-[8px] text-center font-bold mt-1 ${isHoje ? 'text-[var(--cor-primaria)]' : d.valor > 0 ? 'text-white' : 'text-slate-600'}`}>{d.dia}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {ranking.length > 1 && (
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
            <h3 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-white mb-3">
              <Users size={14} className="text-amber-500" /> Ranking
            </h3>
            <div className="space-y-2 overflow-y-auto max-h-[176px] pr-1">
              {ranking.map((r, index) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-xl border border-white/5 bg-white/5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center font-black text-[10px] ${index === 0 ? 'bg-amber-500 text-[#0B1120]' : 'bg-blue-600 text-white'}`}>{index + 1}º</div>
                    <div className="min-w-0"><p className="font-black uppercase text-[10px] text-white truncate">{r.nome}</p><p className="text-[9px] text-slate-500 font-bold">{r.count} vendas</p></div>
                  </div>
                  <p className="text-xs font-black text-slate-300 flex-shrink-0">R$ {r.total.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {orcamentosAbertos.length > 0 && (
        <div className="bg-[#0F172A] border border-purple-500/20 rounded-3xl overflow-hidden mb-6">
          <div className="p-5 border-b border-white/5">
            <h3 className="font-black uppercase text-sm text-purple-400 flex items-center gap-2"><FileText size={14} /> Orçamentos em aberto ({orcamentosAbertos.length})</h3>
          </div>
          <div className="divide-y divide-white/5">
            {orcamentosAbertos.map(v => (
              <div key={v.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0">
                  <p className="font-black text-white uppercase truncate">{v.empresa}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] text-slate-600 font-mono">{formatId(v.id)}</span>
                    <span className="text-[9px] text-slate-500">{new Date(v.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <span className="font-black text-white">R$ {(v.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <button onClick={() => imprimirReciboOuOrcamento(v, unidades.find(u => u.nome === perfil?.unidade), empresa)} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                    <Printer size={10} /> Orçamento
                  </button>
                  {/* <a> normal, não <Link> do Next — precisa forçar recarregamento completo
                  da página. Com navegação "leve" do Next, voltar pra Nova Venda clicando em
                  Editar de novo podia reaproveitar a instância já montada da tela e ignorar
                  o parâmetro novo da URL (só abria de fato clicando 2x). Recarregar do zero
                  garante que o parâmetro sempre é processado. */}
                  <a href={`/pulse/nova-venda?editarOrcamento=${v.id}`} className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                    <Pencil size={10} /> Editar
                  </a>
                  <button onClick={() => converterEmPedido(v)} className="bg-[rgb(var(--cor-primaria-rgb)/10%)] hover:bg-[rgb(var(--cor-primaria-rgb)/20%)] border border-[rgb(var(--cor-primaria-rgb)/30%)] text-[var(--cor-primaria)] px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                    <CheckCircle2 size={10} /> Converter em Pedido
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-black uppercase text-sm text-slate-300">Vendas do mês ({pedidosFechados.length})</h3>
        </div>
        {loadingVendas ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : pedidosFechados.length === 0 ? (
          <div className="p-10 text-center">
            <ShoppingBag size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhuma venda pelo Pulse ainda esse mês.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {pedidosFechados.map(v => (
              <div key={v.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0">
                  <p className="font-black text-white uppercase truncate">{v.empresa}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] text-slate-600 font-mono">{formatId(v.id)}</span>
                    <span className="text-[9px] text-slate-500">{new Date(v.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    {v.forma_pagamento && <span className="text-[9px] bg-white/5 text-slate-400 px-2 py-0.5 rounded uppercase">{FORMAS_PAGAMENTO[v.forma_pagamento] || v.forma_pagamento}</span>}
                    {v.nfse_invoice_id && <span className="text-[9px] bg-[rgb(var(--cor-primaria-rgb)/10%)] text-[var(--cor-primaria)] px-2 py-0.5 rounded uppercase font-black">NF emitida</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <span className="font-black text-white">R$ {(v.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <button onClick={() => imprimirReciboOuOrcamento(v, unidades.find(u => u.nome === perfil?.unidade), empresa)} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                    <Printer size={10} /> Recibo
                  </button>
                  {v.nfse_pdf_url ? (
                    <a href={v.nfse_pdf_url} target="_blank" rel="noopener noreferrer" className="bg-[rgb(var(--cor-primaria-rgb)/10%)] hover:bg-[rgb(var(--cor-primaria-rgb)/20%)] border border-[rgb(var(--cor-primaria-rgb)/30%)] text-[var(--cor-primaria)] px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                      <ExternalLink size={10} /> Ver NF
                    </a>
                  ) : (
                    <button onClick={() => abrirNfse(v)} className="bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                      <FileText size={10} /> Emitir NF
                    </button>
                  )}
                  <button onClick={() => abrirEstorno(v)} className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                    <Undo2 size={10} /> Estornar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {vendasEstornadas.length > 0 && (
        <div className="bg-[#0F172A] border border-red-500/10 rounded-3xl overflow-hidden mt-6">
          <div className="p-5 border-b border-white/5">
            <h3 className="font-black uppercase text-sm text-red-400/80 flex items-center gap-2"><Undo2 size={14} /> Vendas estornadas este mês ({vendasEstornadas.length})</h3>
          </div>
          <div className="divide-y divide-white/5">
            {vendasEstornadas.map(v => (
              <div key={v.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 opacity-60">
                <div className="min-w-0">
                  <p className="font-bold text-white uppercase truncate text-sm">{v.empresa}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] text-slate-600 font-mono">{formatId(v.id)}</span>
                    <span className="text-[9px] text-slate-500">estornada em {new Date(v.estornado_em!).toLocaleDateString('pt-BR')}</span>
                    {v.estornado_motivo && <span className="text-[9px] text-slate-500">· {v.estornado_motivo}</span>}
                  </div>
                </div>
                <span className="font-bold text-slate-500 text-sm shrink-0">R$ {(v.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {abaPainel === 'gerencial' && isLideranca && (loadingGerencial ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Wallet size={10} /> Faturamento do mês</p>
              <p className="text-2xl font-black text-[var(--cor-primaria)] mt-1">R$ {faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
              {variacaoFaturamento != null && (
                <p className={`text-[10px] font-black mt-1 flex items-center gap-1 ${variacaoFaturamento >= 0 ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>
                  {variacaoFaturamento >= 0 ? <BarChart3 size={10} /> : <TrendingDown size={10} />} {variacaoFaturamento >= 0 ? '+' : ''}{variacaoFaturamento.toFixed(0)}% vs mês passado
                </p>
              )}
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><ShoppingBag size={10} /> Pedidos fechados</p>
              <p className="text-2xl font-black text-white mt-1">{pedidosFechados.length}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Ticket médio</p>
              <p className="text-2xl font-black text-white mt-1">R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Boxes size={10} /> Valor em estoque</p>
              <p className="text-2xl font-black text-white mt-1">R$ {valorEstoqueTotalGerencial.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Hammer size={10} /> Em produção</p>
              <p className="text-2xl font-black text-white mt-1">{emProducaoGerencial.length}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10} /> Aguardando entrega</p>
              <p className="text-2xl font-black text-white mt-1">{aguardandoEntregaGerencial.length}</p>
            </div>
            <div className={`bg-[#0F172A] border rounded-2xl p-4 ${atrasadasGerencial.length > 0 ? 'border-red-500/40' : 'border-white/10'}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${atrasadasGerencial.length > 0 ? 'text-red-400' : 'text-slate-500'}`}><AlertTriangle size={10} /> Atrasadas</p>
              <p className={`text-2xl font-black mt-1 ${atrasadasGerencial.length > 0 ? 'text-red-400' : 'text-white'}`}>{atrasadasGerencial.length}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><PackageCheck size={10} /> Entregues no mês</p>
              <p className="text-2xl font-black text-white mt-1">{entregasGerencial.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1"><Clock size={10} /> Tempo médio de produção</p>
              <p className="text-2xl font-black text-white">{tempoMedioProducaoDiasGerencial != null ? `${tempoMedioProducaoDiasGerencial.toFixed(0)} dias` : '—'}</p>
              <p className="text-slate-600 text-[10px] font-bold mt-1">Da abertura até a entrega, nas concluídas este mês</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1"><Factory size={10} /> Custo de produção entregue</p>
              <p className="text-2xl font-black text-white">R$ {custoProducaoMesGerencial.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
              <p className="text-slate-600 text-[10px] font-bold mt-1">Custo de matéria-prima do que foi entregue no mês</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1"><Package size={10} /> Compras de matéria-prima</p>
              <p className="text-2xl font-black text-white">R$ {comprasMesValorGerencial.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
              <p className="text-slate-600 text-[10px] font-bold mt-1">Entradas por NF registradas este mês</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
              <h3 className="font-black uppercase text-sm text-slate-300 mb-4">Gargalo de produção agora</h3>
              {porEtapaGerencial.every(e => e.quantidade === 0) ? (
                <p className="text-slate-600 text-sm font-bold py-6 text-center">Nada em produção no momento.</p>
              ) : (
                <div className="space-y-3">
                  {porEtapaGerencial.map(e => (
                    <div key={e.nome}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-xs font-bold uppercase">{e.nome}</span>
                        <span className="text-amber-400 font-black text-sm">{e.quantidade}</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(e.quantidade / maxEtapaGerencial) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
              <h3 className="font-black uppercase text-sm text-slate-300 mb-4">Itens com estoque baixo ({itensEstoqueBaixoGerencial.length})</h3>
              {itensEstoqueBaixoGerencial.length === 0 ? (
                <p className="text-slate-600 text-sm font-bold py-6 text-center">Nenhum item abaixo do mínimo. 🎉</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {itensEstoqueBaixoGerencial.slice(0, 10).map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                      <p className="text-white font-bold text-xs truncate">{s.nome}</p>
                      <span className="text-red-400 font-black text-xs shrink-0">{s.estoque} un.</span>
                    </div>
                  ))}
                  {itensEstoqueBaixoGerencial.length > 10 && <p className="text-slate-600 text-[10px] text-center pt-1">+ {itensEstoqueBaixoGerencial.length - 10} outro(s).</p>}
                </div>
              )}
            </div>

            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
              <h3 className="font-black uppercase text-sm text-slate-300 mb-4">Reposição inteligente — vão zerar antes do prazo de repor</h3>
              {alertasReposicaoGerencial.length === 0 ? (
                <p className="text-slate-600 text-sm font-bold py-6 text-center">Nenhum alerta no momento.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {alertasReposicaoGerencial.slice(0, 10).map(a => (
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
        </>
      ))}

      {nfseVenda && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setNfseVenda(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-white uppercase italic text-lg">Emitir NFS-e</h3>
                <p className="text-slate-500 text-xs font-bold truncate">{nfseVenda.empresa}</p>
              </div>
              <button onClick={() => setNfseVenda(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                <span className="text-slate-400 text-xs font-bold uppercase">Valor</span>
                <span className="text-white font-black text-lg">R$ {(nfseVenda.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">CPF / CNPJ do cliente</label>
                <input value={nfseCpfCnpj} onChange={e => setNfseCpfCnpj(e.target.value)} placeholder="00.000.000/0001-00" className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm outline-none focus:border-[var(--cor-primaria)] transition-all" />
              </div>
              {nfseErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{nfseErro}</div>}
              <button onClick={emitirNfse} disabled={nfseLoading || !nfseCpfCnpj} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {nfseLoading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {nfseLoading ? 'Emitindo...' : 'Emitir NFS-e'}
              </button>
            </div>
          </div>
        </div>
      )}

      {estornoVenda && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !estornoLoading && setEstornoVenda(null)}>
          <div className="bg-[#0F172A] border border-red-500/20 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Undo2 size={18} className="text-red-400" /> Estornar Venda</h3>
                <p className="text-slate-500 text-xs font-bold truncate">{estornoVenda.empresa} · {formatId(estornoVenda.id)}</p>
              </div>
              <button onClick={() => setEstornoVenda(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-300 text-xs font-bold leading-relaxed">
                Isso devolve pro estoque o que a venda baixou, lança uma saída de R$ {(estornoVenda.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no financeiro pra compensar a entrada original, e a venda sai do faturamento do mês.
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Motivo (opcional)</label>
                <input value={estornoMotivo} onChange={e => setEstornoMotivo(e.target.value)} placeholder="Ex: cliente devolveu o produto" className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm outline-none focus:border-red-500 transition-all" />
              </div>
              {estornoErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{estornoErro}</div>}
              <button onClick={confirmarEstorno} disabled={estornoLoading} className="w-full bg-red-500 hover:bg-red-600 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {estornoLoading ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
                {estornoLoading ? 'Estornando...' : 'Confirmar Estorno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
