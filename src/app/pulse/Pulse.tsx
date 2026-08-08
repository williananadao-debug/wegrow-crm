"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, Plus, Minus, Trash2, X, Loader2, CheckCircle2, Printer, Activity, AlertTriangle, Package, LayoutGrid, ShoppingBag, Boxes, Navigation, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ClienteOpcao = {
  id: number; nome_empresa: string; telefone: string; cnpj?: string;
  inscricao_estadual?: string; email?: string; cidade?: string; endereco?: string;
};

type ServicoConfig = { id: number; nome: string; preco: number; tipo?: string; unidade?: string; estoque?: number | null; imagem_url?: string | null; };

type ItemCarrinho = { servicoId: number; nome: string; quantidade: number; precoUnitario: number; estoqueMax: number | null; };

type VendaPulse = {
  id: number; empresa: string; valor_total: number; created_at: string; forma_pagamento?: string | null;
  cnpj?: string | null; nfse_invoice_id?: string | null; nfse_pdf_url?: string | null;
};

const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto', transferencia: 'Transferência',
};

const formatId = (id: number) => `LD-${String(id).padStart(4, '0')}`;

export default function Pulse({ perfil, user, unidades, isLideranca, usersMap }: {
  perfil: any; user: any; unidades: { id: string; nome: string; razao_social?: string; cnpj?: string; endereco?: string; cidade?: string; estado?: string; }[];
  isLideranca: boolean; usersMap: Record<string, string>;
}) {
  const [aba, setAba] = useState<'painel' | 'nova' | 'estoque'>('painel');

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
  const [novoCnpj, setNovoCnpj] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState('pix');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [vendaConcluida, setVendaConcluida] = useState<any>(null);

  // Painel: vendas do mês + KPIs
  const [vendas, setVendas] = useState<VendaPulse[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(true);

  // Emissão de NFS-e a partir de uma venda do painel
  const [nfseVenda, setNfseVenda] = useState<VendaPulse | null>(null);
  const [nfseCpfCnpj, setNfseCpfCnpj] = useState('');
  const [nfseLoading, setNfseLoading] = useState(false);
  const [nfseErro, setNfseErro] = useState<string | null>(null);

  const fetchServicos = async () => {
    setLoadingServicos(true);
    const { data } = await supabase.from('servicos').select('*').order('nome', { ascending: true });
    if (data) setServicos(data as ServicoConfig[]);
    setLoadingServicos(false);
  };

  const fetchVendas = async () => {
    if (!perfil?.empresa_id) return;
    setLoadingVendas(true);
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const { data } = await supabase.from('leads')
      .select('id, empresa, valor_total, created_at, forma_pagamento, cnpj, nfse_invoice_id, nfse_pdf_url')
      .eq('empresa_id', perfil.empresa_id)
      .eq('tipo', 'Pulse')
      .gte('created_at', inicioMes.toISOString())
      .order('created_at', { ascending: false });
    if (data) setVendas(data as VendaPulse[]);
    setLoadingVendas(false);
  };

  useEffect(() => { fetchServicos(); fetchVendas(); }, [perfil?.empresa_id]);

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

  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);
  const produtosEstoqueBaixo = produtosComEstoque.filter(s => (s.estoque as number) <= 5);

  const hojeStr = new Date().toDateString();
  const vendasHoje = vendas.filter(v => new Date(v.created_at).toDateString() === hojeStr);
  const faturamentoHoje = vendasHoje.reduce((acc, v) => acc + (v.valor_total || 0), 0);
  const faturamentoMes = vendas.reduce((acc, v) => acc + (v.valor_total || 0), 0);

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
    setNovoTelefone(''); setNovoCnpj(''); setFormaPagamento('pix'); setErro(null); setVendaConcluida(null);
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
          nome_empresa: nomeCliente, telefone: novoTelefone || null, cnpj: novoCnpj || null,
          status: 'ativo', status_risco: 'em_analise', empresa_id: perfil?.empresa_id,
        }]).select('id').single();
        if (erroCliente) throw erroCliente;
        clientId = novoCliente.id;
      }

      const itensPayload = carrinho.map(i => ({ servico: i.nome, quantidade: i.quantidade, precoUnitario: i.precoUnitario }));

      const { data: leadData, error: erroLead } = await supabase.from('leads').insert([{
        empresa: nomeCliente,
        telefone: clienteSelecionado?.telefone || novoTelefone || null,
        cnpj: clienteSelecionado?.cnpj || novoCnpj || null,
        valor_total: total,
        desconto,
        itens: itensPayload,
        status: 'ganho',
        etapa: 4,
        tipo: 'Pulse',
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
      fetchVendas();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar a venda.');
    } finally {
      setSalvando(false);
    }
  };

  const imprimirRecibo = (venda?: any, itensOverride?: any[]) => {
    const alvo = venda || vendaConcluida;
    if (!alvo) return;
    const itens = itensOverride || alvo.itens || [];
    const unidadeInfo = unidades.find(u => u.nome === unidadeSel);
    const janela = window.open('', '', 'width=420,height=600');
    if (!janela) return;
    const linhas = itens.map((i: any) =>
      `<tr><td style="padding:4px 0">${i.quantidade}x ${i.servico}</td><td style="text-align:right;padding:4px 0">R$ ${(i.precoUnitario * i.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`
    ).join('');
    janela.document.write(`
      <html><head><title>Recibo ${formatId(alvo.id)}</title></head>
      <body style="font-family:monospace;font-size:12px;padding:16px;max-width:360px;margin:0 auto;">
        <h2 style="text-align:center;margin:0 0 4px;">${unidadeInfo?.razao_social || unidadeInfo?.nome || ''}</h2>
        ${unidadeInfo?.cnpj ? `<p style="text-align:center;margin:0 0 12px;">CNPJ ${unidadeInfo.cnpj}</p>` : ''}
        <hr/>
        <p><b>Recibo:</b> ${formatId(alvo.id)}<br/><b>Cliente:</b> ${alvo.empresa}<br/><b>Data:</b> ${new Date(alvo.created_at || Date.now()).toLocaleString('pt-BR')}</p>
        <hr/>
        <table style="width:100%;border-collapse:collapse;">${linhas}</table>
        <hr/>
        <h3>TOTAL: R$ ${alvo.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
        <p>Pagamento: ${FORMAS_PAGAMENTO[alvo.forma_pagamento || formaPagamento] || alvo.forma_pagamento || ''}</p>
        <script>window.onload = function(){ window.print(); }</script>
      </body></html>
    `);
    janela.document.close();
  };

  const abrirNfse = (venda: VendaPulse) => {
    setNfseVenda(venda);
    setNfseCpfCnpj(venda.cnpj || '');
    setNfseErro(null);
  };

  const emitirNfse = async () => {
    if (!nfseVenda) return;
    setNfseLoading(true);
    setNfseErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/financeiro/nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          empresaId: perfil?.empresa_id,
          nome: nfseVenda.empresa,
          cpfCnpj: nfseCpfCnpj,
          valor: nfseVenda.valor_total,
          dataEfetiva: new Date().toISOString().substring(0, 10),
          leadId: nfseVenda.id,
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

  const ajustarEstoque = async (s: ServicoConfig, delta: number) => {
    const novo = Math.max(0, (s.estoque || 0) + delta);
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
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
            <button onClick={() => imprimirRecibo()} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
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
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
            <Activity size={32} /> Pulse
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Vendas sem funil — feche na hora, acompanhe aqui</p>
        </div>
        <Link href="/visitas" className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all self-start">
          <Navigation size={14} /> Rota do Dia
        </Link>
      </header>

      <div className="flex gap-2 mb-6 border-b border-white/5 pb-4 flex-wrap">
        {([
          ['painel', 'Painel', LayoutGrid],
          ['nova', 'Nova Venda', ShoppingBag],
          ['estoque', 'Estoque', Boxes],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setAba(key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${aba === key ? 'bg-[#22C55E] text-[#0B1120]' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {aba === 'painel' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Vendas hoje</p>
              <p className="text-2xl font-black text-white mt-1">{vendasHoje.length}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Faturamento hoje</p>
              <p className="text-2xl font-black text-[#22C55E] mt-1">R$ {faturamentoHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Faturamento do mês</p>
              <p className="text-2xl font-black text-white mt-1">R$ {faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
            </div>
            <button onClick={() => setAba('estoque')} className="bg-[#0F172A] border border-white/10 hover:border-red-500/30 rounded-2xl p-4 text-left transition-all">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Estoque baixo</p>
              <p className={`text-2xl font-black mt-1 ${produtosEstoqueBaixo.length > 0 ? 'text-red-400' : 'text-white'}`}>{produtosEstoqueBaixo.length}</p>
            </button>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="font-black uppercase text-sm text-slate-300">Vendas do mês ({vendas.length})</h3>
            </div>
            {loadingVendas ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
            ) : vendas.length === 0 ? (
              <div className="p-10 text-center">
                <ShoppingBag size={28} className="text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-bold">Nenhuma venda pelo Pulse ainda esse mês.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {vendas.map(v => (
                  <div key={v.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="font-black text-white uppercase truncate">{v.empresa}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[9px] text-slate-600 font-mono">{formatId(v.id)}</span>
                        <span className="text-[9px] text-slate-500">{new Date(v.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        {v.forma_pagamento && <span className="text-[9px] bg-white/5 text-slate-400 px-2 py-0.5 rounded uppercase">{FORMAS_PAGAMENTO[v.forma_pagamento] || v.forma_pagamento}</span>}
                        {v.nfse_invoice_id && <span className="text-[9px] bg-[#22C55E]/10 text-[#22C55E] px-2 py-0.5 rounded uppercase font-black">NF emitida</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <span className="font-black text-white">R$ {(v.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <button onClick={() => imprimirRecibo(v)} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                        <Printer size={10} /> Recibo
                      </button>
                      {v.nfse_pdf_url ? (
                        <a href={v.nfse_pdf_url} target="_blank" rel="noopener noreferrer" className="bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                          <ExternalLink size={10} /> Ver NF
                        </a>
                      ) : (
                        <button onClick={() => abrirNfse(v)} className="bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1">
                          <FileText size={10} /> Emitir NF
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {aba === 'estoque' && (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <h3 className="font-black uppercase text-sm text-slate-300">Produtos com controle de estoque ({produtosComEstoque.length})</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Pra cadastrar foto/preço ou ligar o controle num produto novo, vai em Configurações → Catálogo</p>
          </div>
          {loadingServicos ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
          ) : produtosComEstoque.length === 0 ? (
            <div className="p-10 text-center">
              <Boxes size={28} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-bold">Nenhum produto com estoque controlado ainda.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {[...produtosComEstoque].sort((a, b) => (a.estoque as number) - (b.estoque as number)).map(s => {
                const baixo = (s.estoque as number) <= 5;
                return (
                  <div key={s.id} className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {s.imagem_url ? <img src={s.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-slate-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">{s.nome}</p>
                      <p className="text-slate-500 text-[10px]">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <button onClick={() => ajustarEstoque(s, -1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Minus size={13} /></button>
                    <span className={`text-sm font-black w-10 text-center ${baixo ? 'text-red-400' : 'text-white'}`}>{s.estoque}</span>
                    <button onClick={() => ajustarEstoque(s, 1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Plus size={13} /></button>
                    {baixo && <span className="text-[9px] font-black text-red-400 uppercase ml-1">baixo</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {aba === 'nova' && (
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
                      <div className="px-4 py-3 space-y-2">
                        <p className="text-slate-400 text-xs font-bold">Cliente novo — "{clienteQuery.trim()}" será cadastrado.</p>
                        <input value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} placeholder="Telefone (opcional)" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-[#22C55E]" />
                        <input value={novoCnpj} onChange={e => setNovoCnpj(e.target.value)} placeholder="CNPJ/CPF (opcional, precisa pra emitir NF)" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-[#22C55E]" />
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
                    <button key={s.id} disabled={semEstoque} onClick={() => adicionarItem(s)} className={`text-left bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/20 rounded-xl overflow-hidden transition-all disabled:opacity-40 disabled:cursor-not-allowed`}>
                      <div className="h-16 bg-white/5 flex items-center justify-center overflow-hidden">
                        {s.imagem_url ? <img src={s.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={20} className="text-slate-600" />}
                      </div>
                      <div className="p-2.5">
                        <p className="text-white text-xs font-bold truncate">{s.nome}</p>
                        <p className="text-[#22C55E] text-sm font-black mt-1">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        {s.estoque !== null && s.estoque !== undefined && (
                          <p className={`text-[9px] font-bold mt-0.5 ${semEstoque ? 'text-red-400' : 'text-slate-500'}`}>{semEstoque ? 'Sem estoque' : `${s.estoque} disponível`}</p>
                        )}
                      </div>
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
                <input value={nfseCpfCnpj} onChange={e => setNfseCpfCnpj(e.target.value)} placeholder="00.000.000/0001-00" className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm outline-none focus:border-[#22C55E] transition-all" />
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
    </div>
  );
}
