"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Activity, ArrowLeft, ShoppingCart, ClipboardList, X, Copy, Send, PackageCheck, Ban, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';
import { calcularNecessidades, ServicoEstoque, FichaLinha, LeadPipeline, NecessidadeMaterial } from '@/lib/estoqueGestao';

type Fornecedor = { id: number; nome: string; prazo_entrega_dias: number | null; telefone: string | null };
type Vinculo = { fornecedor_id: number; servico_id: number; codigo_fornecedor: string | null; ultimo_preco: number | null };
type Pedido = { id: number; fornecedor_id: number | null; status: 'rascunho' | 'enviado' | 'parcial' | 'recebido' | 'cancelado'; previsao_entrega: string | null; observacao: string | null; created_at: string };
type PedidoItem = { id: number; pedido_id: number; servico_id: number; quantidade: number; quantidade_recebida: number; valor_unitario: number };

const STATUS_CFG: Record<Pedido['status'], { label: string; cor: string }> = {
  rascunho: { label: 'Rascunho', cor: 'text-slate-300 bg-white/5 border-white/10' },
  enviado: { label: 'Enviado', cor: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  parcial: { label: 'Recebido parcial', cor: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  recebido: { label: 'Recebido', cor: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  cancelado: { label: 'Cancelado', cor: 'text-red-300 bg-red-500/10 border-red-500/30' },
};
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = 'h-9 bg-black/40 border border-white/10 rounded-lg px-2 text-xs text-white outline-none focus:border-[var(--cor-primaria)]';

export default function ComprasPage() {
  const { authLoading, temPulse, perfil, user, isLideranca } = usePulseAccess();
  const [aba, setAba] = useState<'necessidades' | 'pedidos'>('necessidades');
  const [loading, setLoading] = useState(true);
  const [servicos, setServicos] = useState<ServicoEstoque[]>([]);
  const [fichas, setFichas] = useState<FichaLinha[]>([]);
  const [leads, setLeads] = useState<LeadPipeline[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoItens, setPedidoItens] = useState<PedidoItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // seleção/edição da aba Necessidades
  const [selecionados, setSelecionados] = useState<Record<number, boolean>>({});
  const [qtdEditada, setQtdEditada] = useState<Record<number, number>>({});
  const [fornEscolhido, setFornEscolhido] = useState<Record<number, number | null>>({});
  const [soComSugestao, setSoComSugestao] = useState(true);
  const [gerando, setGerando] = useState(false);

  // detalhe do pedido
  const [pedidoAberto, setPedidoAberto] = useState<Pedido | null>(null);
  const [receb, setReceb] = useState<Record<number, string>>({});
  const [processando, setProcessando] = useState(false);

  const avisar = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 4000); };

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const emp = perfil.empresa_id;
    const [s, f, l, fo, v, p, pi] = await Promise.all([
      supabase.from('servicos').select('id, nome, tipo, estoque, estoque_minimo, estoque_maximo, prazo_reposicao_dias, fornecedor_padrao_id, preco_custo, unidade').eq('empresa_id', emp).not('estoque', 'is', null),
      supabase.from('pulse_fichas_tecnicas').select('produto_final_id, servico_id, quantidade_por_unidade').eq('empresa_id', emp),
      supabase.from('leads').select('id, empresa, etapa, status, itens').eq('empresa_id', emp).eq('status', 'aberto'),
      supabase.from('pulse_fornecedores').select('id, nome, prazo_entrega_dias, telefone').eq('empresa_id', emp).eq('ativo', true).order('nome'),
      supabase.from('pulse_fornecedor_itens').select('fornecedor_id, servico_id, codigo_fornecedor, ultimo_preco').eq('empresa_id', emp),
      supabase.from('pulse_pedidos_compra').select('*').eq('empresa_id', emp).order('created_at', { ascending: false }),
      supabase.from('pulse_pedidos_compra_itens').select('*'),
    ]);
    setServicos((s.data || []) as ServicoEstoque[]);
    setFichas((f.data || []) as FichaLinha[]);
    setLeads((l.data || []) as LeadPipeline[]);
    setFornecedores((fo.data || []) as Fornecedor[]);
    setVinculos((v.data || []) as Vinculo[]);
    setPedidos((p.data || []) as Pedido[]);
    const idsPedidos = new Set((p.data || []).map((x: any) => x.id));
    setPedidoItens(((pi.data || []) as PedidoItem[]).filter(i => idsPedidos.has(i.pedido_id)));
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const necessidades = useMemo(() => calcularNecessidades({ servicos, fichas, leads }), [servicos, fichas, leads]);
  const visiveis = necessidades.filter(n => !soComSugestao || n.sugerido > 0 || n.possivel > 0);
  const nomeForn = (id: number | null) => fornecedores.find(f => f.id === id)?.nome || 'Sem fornecedor';
  const fornecedorDe = (n: NecessidadeMaterial): number | null => fornEscolhido[n.servico.id] !== undefined ? fornEscolhido[n.servico.id] : (n.servico.fornecedor_padrao_id ?? null);
  const precoDe = (servicoId: number, fornId: number | null) => vinculos.find(v => v.servico_id === servicoId && v.fornecedor_id === fornId)?.ultimo_preco ?? servicos.find(s => s.id === servicoId)?.preco_custo ?? 0;
  const qtdDe = (n: NecessidadeMaterial) => qtdEditada[n.servico.id] ?? n.sugerido;

  const gerarPedidos = async () => {
    if (!perfil?.empresa_id) return;
    const escolhidos = visiveis.filter(n => selecionados[n.servico.id] && qtdDe(n) > 0);
    if (escolhidos.length === 0) { avisar('Marque ao menos um item com quantidade maior que zero.'); return; }
    setGerando(true);
    const porForn = new Map<number | null, NecessidadeMaterial[]>();
    escolhidos.forEach(n => { const k = fornecedorDe(n); porForn.set(k, [...(porForn.get(k) || []), n]); });
    let criados = 0; let erro: string | null = null;
    for (const [fornId, itens] of porForn) {
      const prazo = fornecedores.find(f => f.id === fornId)?.prazo_entrega_dias;
      const previsao = prazo != null ? new Date(Date.now() + prazo * 86400000).toISOString().slice(0, 10) : null;
      const { data: ped, error } = await supabase.from('pulse_pedidos_compra').insert([{ empresa_id: perfil.empresa_id, fornecedor_id: fornId, status: 'rascunho', previsao_entrega: previsao, criado_por: user?.id }]).select('id').single();
      if (error || !ped) { erro = error?.message || 'Erro ao criar pedido.'; break; }
      const { error: e2 } = await supabase.from('pulse_pedidos_compra_itens').insert(itens.map(n => ({ pedido_id: ped.id, servico_id: n.servico.id, quantidade: qtdDe(n), valor_unitario: precoDe(n.servico.id, fornId) })));
      if (e2) { erro = e2.message; break; }
      criados++;
    }
    setGerando(false);
    if (erro) { avisar(`Erro: ${erro}`); return; }
    setSelecionados({}); setQtdEditada({});
    avisar(`${criados} pedido(s) criado(s) como rascunho.`);
    await carregar(); setAba('pedidos');
  };

  const itensDoPedido = (id: number) => pedidoItens.filter(i => i.pedido_id === id);
  const totalPedido = (id: number) => itensDoPedido(id).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const nomeServ = (id: number) => servicos.find(s => s.id === id)?.nome || `#${id}`;

  const abrirPedido = (p: Pedido) => {
    setPedidoAberto(p);
    const r: Record<number, string> = {};
    itensDoPedido(p.id).forEach(i => { r[i.id] = String(Math.max(0, i.quantidade - i.quantidade_recebida)); });
    setReceb(r);
  };

  const mudarStatus = async (p: Pedido, status: Pedido['status']) => {
    await supabase.from('pulse_pedidos_compra').update({ status, updated_at: new Date().toISOString() }).eq('id', p.id);
    setPedidoAberto(null); carregar();
  };

  const atualizarValor = async (item: PedidoItem, valor: number) => {
    setPedidoItens(prev => prev.map(i => i.id === item.id ? { ...i, valor_unitario: valor } : i));
    await supabase.from('pulse_pedidos_compra_itens').update({ valor_unitario: valor }).eq('id', item.id);
  };

  const textoPedido = (p: Pedido) => {
    const forn = fornecedores.find(f => f.id === p.fornecedor_id);
    const linhas = itensDoPedido(p.id).map(i => {
      const cod = vinculos.find(v => v.servico_id === i.servico_id && v.fornecedor_id === p.fornecedor_id)?.codigo_fornecedor;
      return `• ${i.quantidade} ${servicos.find(s => s.id === i.servico_id)?.unidade || 'un'} — ${nomeServ(i.servico_id)}${cod ? ` (cód. ${cod})` : ''}`;
    });
    return `Pedido de compra #${p.id}${forn ? ` — ${forn.nome}` : ''}\n\n${linhas.join('\n')}\n${p.previsao_entrega ? `\nEntrega desejada: ${new Date(p.previsao_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}\nFavor confirmar valores e prazo. Obrigado!`;
  };

  // Recebimento: dá entrada no estoque item a item (parcial permitido), registra o custo na
  // movimentação (alimenta custo médio/último custo) e guarda o preço no vínculo do fornecedor.
  const receber = async (p: Pedido) => {
    if (!perfil?.empresa_id) return;
    setProcessando(true);
    const forn = fornecedores.find(f => f.id === p.fornecedor_id);
    let erro: string | null = null;
    for (const item of itensDoPedido(p.id)) {
      const q = Number(receb[item.id] || 0);
      if (!(q > 0)) continue;
      const { data: s } = await supabase.from('servicos').select('estoque').eq('id', item.servico_id).single();
      const novo = (Number(s?.estoque) || 0) + q;
      const e1 = await supabase.from('servicos').update({ estoque: novo }).eq('id', item.servico_id);
      const e2 = await supabase.from('estoque_movimentacoes').insert([{
        empresa_id: perfil.empresa_id, servico_id: item.servico_id, quantidade: q, valor_unitario: item.valor_unitario || null,
        fornecedor: forn?.nome || null, tipo: 'ajuste', motivo: 'compra', user_id: user?.id, observacao: `Recebimento do pedido de compra #${p.id}`,
      }]);
      const e3 = await supabase.from('pulse_pedidos_compra_itens').update({ quantidade_recebida: item.quantidade_recebida + q }).eq('id', item.id);
      if (p.fornecedor_id && item.valor_unitario > 0) {
        await supabase.from('pulse_fornecedor_itens').upsert([{ empresa_id: perfil.empresa_id, fornecedor_id: p.fornecedor_id, servico_id: item.servico_id, ultimo_preco: item.valor_unitario, ultima_compra: new Date().toISOString().slice(0, 10) }], { onConflict: 'fornecedor_id,servico_id' });
      }
      erro = erro || e1.error?.message || e2.error?.message || e3.error?.message || null;
    }
    if (erro) { setProcessando(false); avisar(`Erro: ${erro}`); return; }
    const { data: atualizados } = await supabase.from('pulse_pedidos_compra_itens').select('quantidade, quantidade_recebida').eq('pedido_id', p.id);
    const tudo = (atualizados || []).every((i: any) => i.quantidade_recebida >= i.quantidade);
    await supabase.from('pulse_pedidos_compra').update({ status: tudo ? 'recebido' : 'parcial', updated_at: new Date().toISOString() }).eq('id', p.id);
    setProcessando(false); setPedidoAberto(null);
    avisar(tudo ? 'Pedido recebido — estoque atualizado.' : 'Recebimento parcial registrado — estoque atualizado.');
    carregar();
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temPulse) return <div className="p-8 text-slate-400 font-bold text-sm text-center"><Activity size={28} className="mx-auto mb-2 text-slate-600" />O módulo Pulse não está ativo.</div>;

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      {msg && <div className="fixed top-6 right-6 z-[100] bg-[#0F172A] border border-[var(--cor-primaria)]/40 text-white text-sm font-bold px-4 py-3 rounded-xl shadow-xl">{msg}</div>}
      <header className="mb-6 flex items-center gap-4 flex-wrap">
        <Link href="/pulse/estoque" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"><ArrowLeft size={16} className="text-slate-400" /></Link>
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3"><ShoppingCart size={28} /> Compras</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">O que comprar pelas vendas em andamento e o acompanhamento dos pedidos</p>
        </div>
        <Link href="/pulse/estoque/fornecedores" className="ml-auto text-[11px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl">Fornecedores</Link>
      </header>

      <div className="flex gap-1 bg-black/30 border border-white/10 rounded-xl p-1 mb-5 w-fit">
        {([['necessidades', 'Necessidade de material', ClipboardList], ['pedidos', `Pedidos (${pedidos.length})`, ShoppingCart]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setAba(k)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1.5 ${aba === k ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}><Icon size={13} /> {l}</button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div> : aba === 'necessidades' ? (
        <>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 mb-4 flex items-start gap-3 text-xs text-slate-400 leading-relaxed">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p>A necessidade vem das propostas <b className="text-white">abertas no funil</b> multiplicadas pela <b className="text-white">ficha técnica</b> de cada produto. <b className="text-white">Provável</b> = negociação/aprovação (entra na sugestão); <b className="text-white">Possível</b> = propostas anteriores (só informativo). A sugestão cobre o provável + estoque mínimo, respeitando o máximo. Produto sem ficha técnica não gera necessidade.</p>
          </div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-300"><input type="checkbox" checked={soComSugestao} onChange={e => setSoComSugestao(e.target.checked)} className="accent-[var(--cor-primaria)]" /> Só itens com sugestão ou demanda</label>
            {isLideranca && <button onClick={gerarPedidos} disabled={gerando} className="bg-[var(--cor-primaria)] text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-50">{gerando ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />} Gerar pedido(s) dos marcados</button>}
          </div>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl overflow-x-auto">
            <table className="w-full text-xs min-w-[860px]">
              <thead><tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                <th className="p-3 w-8" /><th className="p-3 text-left">Item</th><th className="p-3 text-right">Estoque</th><th className="p-3 text-right">Mín.</th>
                <th className="p-3 text-right">Provável</th><th className="p-3 text-right">Possível</th><th className="p-3 text-right">Comprar</th><th className="p-3 text-left">Fornecedor</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {visiveis.map(n => (
                  <tr key={n.servico.id} className="hover:bg-white/[0.02]">
                    <td className="p-3"><input type="checkbox" checked={!!selecionados[n.servico.id]} onChange={e => setSelecionados(prev => ({ ...prev, [n.servico.id]: e.target.checked }))} className="accent-[var(--cor-primaria)]" /></td>
                    <td className="p-3"><p className="font-bold text-white">{n.servico.nome}</p>{n.vendas.length > 0 && <p className="text-[10px] text-slate-500 truncate max-w-[280px]" title={n.vendas.map(v => `${v.cliente} (${v.quantidade})`).join(', ')}>{[...new Set(n.vendas.map(v => v.cliente))].slice(0, 3).join(', ')}</p>}</td>
                    <td className={`p-3 text-right font-black ${n.estoque <= n.minimo ? 'text-red-400' : 'text-white'}`}>{n.estoque}</td>
                    <td className="p-3 text-right text-slate-400">{n.minimo}</td>
                    <td className="p-3 text-right text-amber-300 font-bold">{n.provavel ? Number(n.provavel.toFixed(2)) : '—'}</td>
                    <td className="p-3 text-right text-slate-500">{n.possivel ? Number(n.possivel.toFixed(2)) : '—'}</td>
                    <td className="p-3 text-right"><input type="number" min="0" value={qtdDe(n)} onChange={e => setQtdEditada(prev => ({ ...prev, [n.servico.id]: Number(e.target.value) }))} className={`${inp} w-20 text-right font-black ${n.sugerido > 0 ? 'text-[var(--cor-primaria)]' : ''}`} /></td>
                    <td className="p-3"><select value={fornecedorDe(n) ?? ''} onChange={e => setFornEscolhido(prev => ({ ...prev, [n.servico.id]: e.target.value === '' ? null : Number(e.target.value) }))} className={`${inp} w-44`}>
                      <option value="" className="bg-[#0B1120]">Sem fornecedor</option>{fornecedores.map(f => <option key={f.id} value={f.id} className="bg-[#0B1120]">{f.nome}</option>)}</select></td>
                  </tr>
                ))}
                {visiveis.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-500 font-bold">Nada a comprar agora. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {pedidos.map(p => (
            <button key={p.id} onClick={() => abrirPedido(p)} className="w-full text-left bg-[#0F172A] border border-white/10 hover:border-white/25 rounded-2xl p-4 flex items-center gap-4 flex-wrap transition-all">
              <span className="font-mono text-xs text-slate-500 w-14">#{p.id}</span>
              <div className="flex-1 min-w-[160px]"><p className="font-black text-sm uppercase">{nomeForn(p.fornecedor_id)}</p><p className="text-[10px] text-slate-500 font-bold">{itensDoPedido(p.id).length} item(ns) · criado em {new Date(p.created_at).toLocaleDateString('pt-BR')}{p.previsao_entrega ? ` · entrega ${new Date(p.previsao_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}</p></div>
              <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border ${STATUS_CFG[p.status].cor}`}>{STATUS_CFG[p.status].label}</span>
              <span className="font-black text-sm w-32 text-right tabular-nums">{brl(totalPedido(p.id))}</span>
            </button>
          ))}
          {pedidos.length === 0 && <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center text-slate-500 text-sm font-bold">Nenhum pedido ainda. Marque itens na aba Necessidade de material e gere os pedidos.</div>}
        </div>
      )}

      {pedidoAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !processando && setPedidoAberto(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div><h3 className="font-black uppercase italic">Pedido #{pedidoAberto.id} — {nomeForn(pedidoAberto.fornecedor_id)}</h3><span className={`inline-block mt-1 text-[10px] font-black uppercase px-2 py-0.5 rounded border ${STATUS_CFG[pedidoAberto.status].cor}`}>{STATUS_CFG[pedidoAberto.status].label}</span></div>
              <button onClick={() => setPedidoAberto(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {itensDoPedido(pedidoAberto.id).map(i => {
                const editavel = pedidoAberto.status === 'rascunho';
                const recebivel = ['enviado', 'parcial'].includes(pedidoAberto.status);
                return (
                  <div key={i.id} className="bg-black/30 border border-white/5 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]"><p className="font-bold text-sm">{nomeServ(i.servico_id)}</p><p className="text-[10px] text-slate-500">Pedido: {i.quantidade} · Recebido: {i.quantidade_recebida}</p></div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">R$ un.
                      <input type="number" step="0.01" disabled={!editavel} value={i.valor_unitario} onChange={e => atualizarValor(i, Number(e.target.value))} className={`${inp} w-24 ml-1 text-right disabled:opacity-60`} /></label>
                    {recebivel && <label className="text-[10px] font-bold text-emerald-400 uppercase">Receber
                      <input type="number" min="0" value={receb[i.id] ?? ''} onChange={e => setReceb(prev => ({ ...prev, [i.id]: e.target.value }))} className={`${inp} w-20 ml-1 text-right`} /></label>}
                  </div>
                );
              })}
              <p className="text-right text-sm font-black pt-2">Total: {brl(totalPedido(pedidoAberto.id))}</p>
            </div>
            <div className="p-5 border-t border-white/10 flex gap-2 flex-wrap">
              <button onClick={() => { navigator.clipboard.writeText(textoPedido(pedidoAberto)); avisar('Texto do pedido copiado — cole no WhatsApp ou e-mail.'); }} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-black uppercase flex items-center gap-1.5"><Copy size={13} /> Copiar texto</button>
              {isLideranca && pedidoAberto.status === 'rascunho' && <button onClick={() => mudarStatus(pedidoAberto, 'enviado')} className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase flex items-center gap-1.5"><Send size={13} /> Marcar como enviado</button>}
              {['enviado', 'parcial'].includes(pedidoAberto.status) && <button onClick={() => receber(pedidoAberto)} disabled={processando} className="px-4 py-2.5 rounded-xl bg-[var(--cor-primaria)] text-[#0B1120] text-[11px] font-black uppercase flex items-center gap-1.5 disabled:opacity-50">{processando ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />} Dar entrada no estoque</button>}
              {isLideranca && !['recebido', 'cancelado'].includes(pedidoAberto.status) && <button onClick={() => mudarStatus(pedidoAberto, 'cancelado')} className="ml-auto px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[11px] font-black uppercase flex items-center gap-1.5"><Ban size={13} /> Cancelar pedido</button>}
              {pedidoAberto.status === 'recebido' && <span className="ml-auto text-emerald-400 text-xs font-black flex items-center gap-1"><Check size={14} /> Concluído</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
