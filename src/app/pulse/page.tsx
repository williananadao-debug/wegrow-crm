"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Activity, LayoutGrid, ShoppingBag, BarChart3, Users, Printer, FileText, ExternalLink, CheckCircle2, X, Navigation, Plus, Boxes, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from './usePulseAccess';
import { VendaPulse, ServicoConfig, RankingItem, FORMAS_PAGAMENTO, formatId, getLocalYYYYMMDD, formatCompact, imprimirReciboOuOrcamento, alertarEstoqueBaixoSeCruzou } from './shared';

export default function PulsePainelPage() {
  const { authLoading, perfil, user, unidades, isLideranca, usersMap, temPulse } = usePulseAccess();

  const [vendas, setVendas] = useState<VendaPulse[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(true);
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);

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
    const { data } = await supabase.from('leads')
      .select('id, empresa, valor_total, created_at, forma_pagamento, cnpj, nfse_invoice_id, nfse_pdf_url, user_id, status, itens, estornado_em, estornado_motivo')
      .eq('empresa_id', perfil.empresa_id).eq('tipo', 'Pulse')
      .gte('created_at', inicioMes.toISOString())
      .order('created_at', { ascending: false });
    if (data) setVendas(data as VendaPulse[]);
    setLoadingVendas(false);
  };

  const fetchServicos = async () => {
    const { data } = await supabase.from('servicos').select('*');
    if (data) setServicos(data as ServicoConfig[]);
  };

  useEffect(() => { if (perfil?.empresa_id) { fetchVendas(); fetchServicos(); } }, [perfil?.empresa_id]);

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

      const itens = estornoVenda.itens || [];
      await Promise.all([
        // Reversão do lançamento — nunca apaga o registro original, lança uma saída
        // compensatória em espelho, igual se faz em qualquer estorno contábil de verdade.
        supabase.from('lancamentos').insert([{
          titulo: `ESTORNO: ${estornoVenda.empresa} - OS: ${formatId(estornoVenda.id)}`,
          valor: estornoVenda.valor_total, tipo: 'saida', categoria: 'Estorno', status: 'pendente',
          data_vencimento: new Date().toISOString().split('T')[0],
          user_id: user?.id, empresa_id: perfil?.empresa_id,
        }]),
        ...itens.flatMap(item => {
          const s = servicos.find(x => x.nome === item.servico);
          if (!s || s.estoque === null || s.estoque === undefined) return [];
          return [
            supabase.from('servicos').update({ estoque: (s.estoque || 0) + item.quantidade }).eq('id', s.id),
            supabase.from('estoque_movimentacoes').insert([{
              empresa_id: perfil?.empresa_id, servico_id: s.id, quantidade: item.quantidade,
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
          <Link href="/pulse/nova-venda" className="inline-flex items-center gap-2 bg-[var(--cor-primaria)] text-[#0B1120] hover:scale-105 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Plus size={14} /> Nova Venda
          </Link>
          <Link href="/visitas" className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Navigation size={14} /> Rota do Dia
          </Link>
        </div>
      </header>

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
                  <button onClick={() => imprimirReciboOuOrcamento(v, unidades.find(u => u.nome === perfil?.unidade))} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                    <Printer size={10} /> Orçamento
                  </button>
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
                  <button onClick={() => imprimirReciboOuOrcamento(v, unidades.find(u => u.nome === perfil?.unidade))} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
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
                Isso devolve {(estornoVenda.itens || []).length} item(ns) pro estoque, lança uma saída de R$ {(estornoVenda.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no financeiro pra compensar a entrada original, e a venda sai do faturamento do mês.
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
