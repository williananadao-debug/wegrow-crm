"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Minus, Trash2, X, Loader2, CheckCircle2, Printer, ShoppingCart, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ClienteOpcao = {
  id: number; nome_empresa: string; telefone: string; cnpj?: string;
  inscricao_estadual?: string; email?: string; cidade?: string; endereco?: string;
};

type ServicoConfig = { id: number; nome: string; preco: number; tipo?: string; unidade?: string; estoque?: number | null; };

type ItemCarrinho = { servicoId: number; nome: string; quantidade: number; precoUnitario: number; estoqueMax: number | null; };

const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto', transferencia: 'Transferência',
};

const formatId = (id: number) => `LD-${String(id).padStart(4, '0')}`;

export default function VendaRapida({ perfil, user, unidades, isLideranca, usersMap }: {
  perfil: any; user: any; unidades: { id: string; nome: string; razao_social?: string; cnpj?: string; endereco?: string; cidade?: string; estado?: string; }[];
  isLideranca: boolean; usersMap: Record<string, string>;
}) {
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(true);
  const [busca, setBusca] = useState('');

  const [unidadeSel, setUnidadeSel] = useState(perfil?.unidade || unidades[0]?.nome || '');
  const [vendedorId, setVendedorId] = useState(user?.id || '');

  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteResultados, setClienteResultados] = useState<ClienteOpcao[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteOpcao | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState('pix');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [vendaConcluida, setVendaConcluida] = useState<any>(null);

  useEffect(() => {
    const carregar = async () => {
      setLoadingServicos(true);
      const { data } = await supabase.from('servicos').select('*').order('nome', { ascending: true });
      if (data) setServicos(data as ServicoConfig[]);
      setLoadingServicos(false);
    };
    carregar();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (clienteQuery.trim().length < 2) { setClienteResultados([]); return; }
    setBuscandoCliente(true);
    debounceRef.current = setTimeout(async () => {
      const q = clienteQuery.trim();
      const qCnpj = q.replace(/\D/g, '');
      const { data } = await supabase.from('clientes')
        .select('id, nome_empresa, telefone, cnpj, inscricao_estadual, email, cidade, endereco')
        .eq('status', 'ativo')
        .eq('empresa_id', perfil?.empresa_id)
        .or(`nome_empresa.ilike.%${q}%${qCnpj ? `,cnpj.ilike.%${qCnpj}%` : ''}`)
        .order('nome_empresa').limit(10);
      setClienteResultados((data as ClienteOpcao[]) || []);
      setBuscandoCliente(false);
    }, 350);
  }, [clienteQuery, perfil?.empresa_id]);

  const servicosFiltrados = servicos.filter(s => {
    if (s.unidade && s.unidade !== unidadeSel) return false;
    if (!busca.trim()) return true;
    return s.nome.toLowerCase().includes(busca.trim().toLowerCase());
  });

  const adicionarItem = (s: ServicoConfig) => {
    setCarrinho(prev => {
      const existente = prev.find(i => i.servicoId === s.id);
      const maxima = s.estoque ?? null;
      if (existente) {
        const novaQtd = existente.quantidade + 1;
        if (maxima !== null && novaQtd > maxima) return prev;
        return prev.map(i => i.servicoId === s.id ? { ...i, quantidade: novaQtd } : i);
      }
      if (maxima !== null && maxima <= 0) return prev;
      return [...prev, { servicoId: s.id, nome: s.nome, quantidade: 1, precoUnitario: s.preco, estoqueMax: maxima }];
    });
  };

  const alterarQuantidade = (servicoId: number, delta: number) => {
    setCarrinho(prev => prev.map(i => {
      if (i.servicoId !== servicoId) return i;
      const nova = i.quantidade + delta;
      if (nova < 1) return i;
      if (i.estoqueMax !== null && nova > i.estoqueMax) return i;
      return { ...i, quantidade: nova };
    }));
  };

  const removerItem = (servicoId: number) => setCarrinho(prev => prev.filter(i => i.servicoId !== servicoId));

  const subtotal = carrinho.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
  const total = Math.max(0, subtotal - desconto);

  const resetar = () => {
    setCarrinho([]); setDesconto(0); setClienteSelecionado(null); setClienteQuery('');
    setNovoTelefone(''); setFormaPagamento('pix'); setErro(null); setVendaConcluida(null);
  };

  const finalizarVenda = async () => {
    setErro(null);
    if (!clienteSelecionado && clienteQuery.trim().length < 2) { setErro('Selecione ou digite o nome do cliente.'); return; }
    if (carrinho.length === 0) { setErro('Adicione pelo menos um item.'); return; }

    setSalvando(true);
    try {
      let clientId = clienteSelecionado?.id ?? null;
      const nomeCliente = clienteSelecionado?.nome_empresa || clienteQuery.trim();

      if (!clientId) {
        const { data: novoCliente, error: erroCliente } = await supabase.from('clientes').insert([{
          nome_empresa: nomeCliente, telefone: novoTelefone || null,
          status: 'ativo', status_risco: 'em_analise', empresa_id: perfil?.empresa_id,
        }]).select('id').single();
        if (erroCliente) throw erroCliente;
        clientId = novoCliente.id;
      }

      const itensPayload = carrinho.map(i => ({ servico: i.nome, quantidade: i.quantidade, precoUnitario: i.precoUnitario }));

      const { data: leadData, error: erroLead } = await supabase.from('leads').insert([{
        empresa: nomeCliente,
        telefone: clienteSelecionado?.telefone || novoTelefone || null,
        cnpj: clienteSelecionado?.cnpj || null,
        valor_total: total,
        desconto,
        itens: itensPayload,
        status: 'ganho',
        etapa: 4,
        tipo: 'Venda Rápida',
        unidade: unidadeSel || null,
        forma_pagamento: formaPagamento,
        parcelas: '1',
        client_id: clientId,
        empresa_id: perfil?.empresa_id,
        user_id: vendedorId || user?.id,
        criado_por: user?.id,
        ordem: 0,
      }]).select().single();
      if (erroLead) throw erroLead;

      await Promise.all([
        supabase.from('lancamentos').insert([{
          titulo: `VENDA RÁPIDA: ${nomeCliente} (${unidadeSel || 'Geral'}) - OS: ${formatId(leadData.id)}`,
          valor: total, tipo: 'entrada', categoria: 'vendas', status: 'pendente',
          data_vencimento: new Date().toISOString().split('T')[0],
          user_id: user?.id, empresa_id: perfil?.empresa_id,
        }]),
        ...carrinho.filter(i => i.estoqueMax !== null).map(i =>
          supabase.from('servicos').update({ estoque: Math.max(0, (i.estoqueMax as number) - i.quantidade) }).eq('id', i.servicoId)
        ),
      ]);

      setServicos(prev => prev.map(s => {
        const item = carrinho.find(i => i.servicoId === s.id);
        return item && s.estoque !== null && s.estoque !== undefined ? { ...s, estoque: Math.max(0, s.estoque - item.quantidade) } : s;
      }));

      setVendaConcluida({ ...leadData, empresa: nomeCliente, itens: itensPayload });
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar a venda.');
    } finally {
      setSalvando(false);
    }
  };

  const imprimirRecibo = () => {
    if (!vendaConcluida) return;
    const unidadeInfo = unidades.find(u => u.nome === unidadeSel);
    const janela = window.open('', '', 'width=420,height=600');
    if (!janela) return;
    const linhas = vendaConcluida.itens.map((i: any) =>
      `<tr><td style="padding:4px 0">${i.quantidade}x ${i.servico}</td><td style="text-align:right;padding:4px 0">R$ ${(i.precoUnitario * i.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`
    ).join('');
    janela.document.write(`
      <html><head><title>Recibo ${formatId(vendaConcluida.id)}</title></head>
      <body style="font-family:monospace;font-size:12px;padding:16px;max-width:360px;margin:0 auto;">
        <h2 style="text-align:center;margin:0 0 4px;">${unidadeInfo?.razao_social || unidadeInfo?.nome || ''}</h2>
        ${unidadeInfo?.cnpj ? `<p style="text-align:center;margin:0 0 12px;">CNPJ ${unidadeInfo.cnpj}</p>` : ''}
        <hr/>
        <p><b>Recibo:</b> ${formatId(vendaConcluida.id)}<br/><b>Cliente:</b> ${vendaConcluida.empresa}<br/><b>Data:</b> ${new Date().toLocaleString('pt-BR')}</p>
        <hr/>
        <table style="width:100%;border-collapse:collapse;">${linhas}</table>
        <hr/>
        ${desconto > 0 ? `<p>Subtotal: R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<br/>Desconto: -R$ ${desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>` : ''}
        <h3>TOTAL: R$ ${vendaConcluida.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
        <p>Pagamento: ${FORMAS_PAGAMENTO[formaPagamento] || formaPagamento}</p>
        <script>window.onload = function(){ window.print(); }</script>
      </body></html>
    `);
    janela.document.close();
  };

  if (vendaConcluida) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white flex items-center justify-center min-h-[70vh]">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center">
          <CheckCircle2 size={40} className="text-[#22C55E] mx-auto mb-3" />
          <p className="text-white font-black text-lg uppercase">Venda registrada!</p>
          <p className="text-slate-400 text-sm mt-1">{formatId(vendaConcluida.id)} · {vendaConcluida.empresa}</p>
          <p className="text-3xl font-black text-[#22C55E] mt-4">R$ {vendaConcluida.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="flex gap-2 mt-6">
            <button onClick={imprimirRecibo} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              <Printer size={14} /> Recibo
            </button>
            <button onClick={resetar} className="flex-1 bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              <Plus size={14} /> Nova venda
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
          <ShoppingCart size={32} /> Venda Rápida
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Monte o pedido e feche na hora — sem funil</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2 block">Cliente</label>
            {clienteSelecionado ? (
              <div className="flex items-center justify-between bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white font-bold text-sm">{clienteSelecionado.nome_empresa}</p>
                  {clienteSelecionado.telefone && <p className="text-slate-400 text-xs">{clienteSelecionado.telefone}</p>}
                </div>
                <button onClick={() => { setClienteSelecionado(null); setClienteQuery(''); }} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#22C55E]">
                  <Search size={14} className="text-slate-500 flex-shrink-0" />
                  <input value={clienteQuery} onChange={e => setClienteQuery(e.target.value)} placeholder="Nome ou CNPJ do cliente..." className="flex-1 bg-transparent outline-none text-white text-sm" />
                  {buscandoCliente && <Loader2 size={14} className="animate-spin text-slate-500" />}
                </div>
                {clienteQuery.trim().length >= 2 && (
                  <div className="absolute z-20 mt-1 w-full bg-[#0F172A] border border-white/10 rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-2xl">
                    {clienteResultados.map(c => (
                      <button key={c.id} onClick={() => { setClienteSelecionado(c); setClienteResultados([]); }} className="w-full text-left px-4 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-0">
                        <p className="text-white text-sm font-bold">{c.nome_empresa}</p>
                        {c.telefone && <p className="text-slate-500 text-xs">{c.telefone}</p>}
                      </button>
                    ))}
                    {!buscandoCliente && clienteResultados.length === 0 && (
                      <div className="px-4 py-3">
                        <p className="text-slate-400 text-xs font-bold mb-2">Cliente novo — "{clienteQuery.trim()}" será cadastrado.</p>
                        <input value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} placeholder="Telefone (opcional)" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-[#22C55E]" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 mb-4 focus-within:border-[#22C55E]">
              <Search size={14} className="text-slate-500 flex-shrink-0" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto no catálogo..." className="flex-1 bg-transparent outline-none text-white text-sm" />
            </div>
            {loadingServicos ? (
              <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                {servicosFiltrados.map(s => {
                  const semEstoque = s.estoque !== null && s.estoque !== undefined && s.estoque <= 0;
                  return (
                    <button key={s.id} disabled={semEstoque} onClick={() => adicionarItem(s)} className={`text-left bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/20 rounded-xl p-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed`}>
                      <p className="text-white text-xs font-bold truncate">{s.nome}</p>
                      <p className="text-[#22C55E] text-sm font-black mt-1">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      {s.estoque !== null && s.estoque !== undefined && (
                        <p className={`text-[9px] font-bold mt-0.5 ${semEstoque ? 'text-red-400' : 'text-slate-500'}`}>{semEstoque ? 'Sem estoque' : `${s.estoque} disponível`}</p>
                      )}
                    </button>
                  );
                })}
                {servicosFiltrados.length === 0 && <p className="col-span-full text-center text-slate-500 text-xs font-bold py-6">Nenhum produto encontrado.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3 block">Pedido</label>
            {carrinho.length === 0 ? (
              <p className="text-slate-500 text-xs font-bold text-center py-6">Nenhum item ainda.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {carrinho.map(i => (
                  <div key={i.servicoId} className="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-bold truncate">{i.nome}</p>
                      <p className="text-slate-500 text-[10px]">R$ {i.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} un.</p>
                    </div>
                    <button onClick={() => alterarQuantidade(i.servicoId, -1)} className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Minus size={12} /></button>
                    <span className="text-white text-xs font-black w-5 text-center">{i.quantidade}</span>
                    <button onClick={() => alterarQuantidade(i.servicoId, 1)} disabled={i.estoqueMax !== null && i.quantidade >= i.estoqueMax} className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 disabled:opacity-30"><Plus size={12} /></button>
                    <button onClick={() => removerItem(i.servicoId)} className="text-slate-600 hover:text-red-400 p-1"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-white/5 pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-bold">Subtotal</span>
                <span className="text-white font-bold">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-bold text-xs">Desconto R$</span>
                <input type="number" value={desconto || ''} onChange={e => setDesconto(Math.max(0, Number(e.target.value) || 0))} className="w-24 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right outline-none focus:border-[#22C55E]" placeholder="0" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-white font-black uppercase text-sm">Total</span>
                <span className="text-[#22C55E] font-black text-xl">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5 space-y-3">
            {unidades.length > 1 && (
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Unidade</label>
                <select value={unidadeSel} onChange={e => setUnidadeSel(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]">
                  {unidades.map(u => <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>)}
                </select>
              </div>
            )}
            {isLideranca && Object.keys(usersMap).length > 0 && (
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Vendedor</label>
                <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]">
                  {Object.entries(usersMap).map(([id, nome]) => <option key={id} value={id} className="bg-[#0B1120]">{nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Pagamento</label>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(FORMAS_PAGAMENTO).map(([valor, label]) => (
                  <button key={valor} onClick={() => setFormaPagamento(valor)} className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${formaPagamento === valor ? 'bg-[#22C55E] text-[#0B1120]' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {erro && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle size={14} className="flex-shrink-0" /> {erro}
            </div>
          )}

          <button onClick={finalizarVenda} disabled={salvando} className="w-full bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-[#0B1120] font-black uppercase text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
            {salvando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            {salvando ? 'Salvando...' : 'Fechar venda'}
          </button>
        </div>
      </div>
    </div>
  );
}
