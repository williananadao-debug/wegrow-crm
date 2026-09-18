"use client";
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Plus, Minus, Trash2, X, Loader2, CheckCircle2, Printer, ShoppingBag, Package, AlertTriangle, Activity, FileText, Factory, History, ChevronDown, ChevronUp, Info, Pencil, Settings2, UserPlus, PenTool, Zap, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ClienteOpcao, ServicoConfig, ItemCarrinho, ConfiguracaoItem, FichaTecnicaItem, FORMAS_PAGAMENTO, formatId, imprimirReciboOuOrcamento, alertarEstoqueBaixoSeCruzou, registrarProducaoAutomatica, ehMateriaPrima } from '../shared';

const novaChaveExtra = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

function PulseNovaVendaContent() {
  const { authLoading, perfil, user, unidades, isLideranca, usersMap, temPulse, empresa } = usePulseAccess();
  const searchParams = useSearchParams();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(true);
  const [fichas, setFichas] = useState<{ produto_final_id: number; servico_id: number; quantidade_por_unidade: number }[]>([]);
  const [busca, setBusca] = useState('');
  const [producoesIniciadas, setProducoesIniciadas] = useState<{ nome: string; ok: boolean }[]>([]);

  const [unidadeSel, setUnidadeSel] = useState('');
  const [vendedorId, setVendedorId] = useState('');

  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteResultados, setClienteResultados] = useState<ClienteOpcao[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteOpcao | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Catálogo fica livre pra navegar sem cliente selecionado (só precisa ter um na hora de
  // fechar a venda de verdade, validado em finalizarVenda), pra dar pra mostrar produto
  // num atendimento sem travar tudo esperando o cadastro do cliente primeiro.

  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [acrescimo, setAcrescimo] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState('pix');
  // Não-nulo = reabriu um orçamento salvo pra editar; "salvar" vira update dessa linha em
  // vez de criar venda nova (ver finalizarVenda).
  const [orcamentoEditandoId, setOrcamentoEditandoId] = useState<number | null>(null);

  // Produto 100% personalizado (fora do catálogo, ex: trailer sob medida que não é
  // nenhum dos modelos prontos) usa o mesmo configurador dos produtos de catálogo — id
  // local negativo, decrescente, nunca colide com id real de servico (sempre positivo).
  const proximoIdAvulsoRef = useRef(-1);

  // Detalhe expandido do produto (imagem grande + descrição completa). Pra item sob
  // encomenda (trailer), dobra de função como CONFIGURADOR: some com o botão "Adicionar
  // ao pedido" simples e some com uma seção de extras (configuração/personalização, cada
  // um com seu valor — soma ou desconta do preço base). editandoServicoId != null =
  // reabriu pra editar um item que já está no carrinho (substitui em vez de duplicar).
  const [produtoDetalhe, setProdutoDetalhe] = useState<ServicoConfig | null>(null);
  const [extrasConfigurando, setExtrasConfigurando] = useState<ConfiguracaoItem[]>([]);
  const [novoExtraDescricao, setNovoExtraDescricao] = useState('');
  const [novoExtraValor, setNovoExtraValor] = useState('');
  const [editandoServicoId, setEditandoServicoId] = useState<number | null>(null);
  const [criandoPersonalizado, setCriandoPersonalizado] = useState(false);
  // "Agora" travado num state em vez de Date.now() direto no cálculo — chamar função
  // impura no render quebra a regra de pureza do React.
  const [agora] = useState(() => Date.now());

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [vendaConcluida, setVendaConcluida] = useState<any>(null);

  // Contrato via Docuseal — só pra venda fechada (não faz sentido em orçamento ainda não
  // aprovado). clienteSelecionado continua em memória até "Nova venda" resetar, por isso
  // dá pra reaproveitar endereço/e-mail dele aqui sem buscar de novo.
  const [vendaAlvo, setVendaAlvo] = useState<any>(null);
  const [contratoAberto, setContratoAberto] = useState(false);
  const [contratoEmail, setContratoEmail] = useState('');
  const [contratoTelefone, setContratoTelefone] = useState('');
  const [enviandoContrato, setEnviandoContrato] = useState(false);
  const [contratoErro, setContratoErro] = useState<string | null>(null);
  const [contratoLinks, setContratoLinks] = useState<{ consultorSignUrl: string; signUrl: string | null } | null>(null);

  // NF1 (entrega futura, CFOP 5922) — emitida na hora da venda. A NF2 (entrega, CFOP
  // 5116/6116) fica pro momento real da entrega, disparada em /pulse/producao.
  const [emitindoNf, setEmitindoNf] = useState(false);
  const [nfErro, setNfErro] = useState<string | null>(null);
  const [nfEmitida, setNfEmitida] = useState(false);

  // Boleto/Pix (Asaas) — valor e vencimento editáveis porque a venda pode ser cobrada em
  // partes (ex: só a entrada agora), não necessariamente o valor_total de uma vez.
  const [cobrancaAberto, setCobrancaAberto] = useState(false);
  const [cobrancaTipo, setCobrancaTipo] = useState<'PIX' | 'BOLETO'>('PIX');
  const [cobrancaValor, setCobrancaValor] = useState('');
  const [cobrancaVencimento, setCobrancaVencimento] = useState('');
  const [cobrancaParcelas, setCobrancaParcelas] = useState('1');
  const [enviandoCobranca, setEnviandoCobranca] = useState(false);
  const [cobrancaErro, setCobrancaErro] = useState<string | null>(null);
  const [cobrancaResultado, setCobrancaResultado] = useState<Array<{ parcela: string | null; tipo: string; valor: number; invoiceUrl: string | null; bankSlipUrl: string | null; linhaDigitavel: string | null; pixPayload: string | null }> | null>(null);
  const [cancelandoCobranca, setCancelandoCobranca] = useState<string | null>(null);

  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState('');
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);

  const carregarHistorico = async () => {
    if (!perfil?.empresa_id) return;
    setCarregandoHistorico(true);
    const { data } = await supabase.from('leads')
      .select('id, empresa, valor_total, status, itens, created_at, forma_pagamento, cnpj, client_id, desconto, cobrancas_manuais')
      .eq('empresa_id', perfil.empresa_id).eq('tipo', 'Pulse')
      .order('created_at', { ascending: false }).limit(30);
    setHistorico(data || []);
    setCarregandoHistorico(false);
  };

  const toggleHistorico = () => {
    const abrindo = !mostrarHistorico;
    setMostrarHistorico(abrindo);
    if (abrindo && historico.length === 0) carregarHistorico();
  };

  const historicoFiltrado = historico.filter(h =>
    !buscaHistorico.trim() || h.empresa?.toLowerCase().includes(buscaHistorico.trim().toLowerCase()) || String(h.id).includes(buscaHistorico.trim())
  );
  const totalHistoricoFiltrado = historicoFiltrado.filter(h => h.status !== 'orcamento').reduce((s, h) => s + Number(h.valor_total || 0), 0);

  const cancelarOrcamento = async (id: number) => {
    if (!confirm('Cancelar este orçamento? Essa ação não pode ser desfeita.')) return;
    setCancelandoId(id);
    const { error } = await supabase.from('leads').delete().eq('id', id);
    setCancelandoId(null);
    if (!error) setHistorico(prev => prev.filter(h => h.id !== id));
  };

  useEffect(() => {
    if (!unidadeSel) setUnidadeSel(perfil?.unidade || unidades[0]?.nome || '');
    if (!vendedorId) setVendedorId(user?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.unidade, unidades, user?.id]);

  useEffect(() => {
    const carregar = async () => {
      setLoadingServicos(true);
      const [{ data }, { data: fichasData }] = await Promise.all([
        supabase.from('servicos').select('*').order('nome', { ascending: true }),
        supabase.from('pulse_fichas_tecnicas').select('produto_final_id, servico_id, quantidade_por_unidade'),
      ]);
      if (data) setServicos(data as ServicoConfig[]);
      if (fichasData) setFichas(fichasData);
      setLoadingServicos(false);
    };
    carregar();
  }, []);

  const fichasPorProduto = useMemo(() => {
    const m = new Map<number, FichaTecnicaItem[]>();
    for (const f of fichas) {
      const lista = m.get(f.produto_final_id) || [];
      lista.push({ servicoId: f.servico_id, quantidadePorUnidade: Number(f.quantidade_por_unidade) });
      m.set(f.produto_final_id, lista);
    }
    return m;
  }, [fichas]);

  // Sob encomenda = não guarda produto pronto parado (ex: trailer) — precisa de ficha
  // técnica cadastrada em Produção antes de poder ser vendido, porque é ela que dispara a
  // produção automaticamente ao fechar o pedido.
  const ehSobEncomenda = (s: ServicoConfig) => !ehMateriaPrima(s) && (s.estoque === null || s.estoque === undefined);

  // Abre a tela cheia de Clientes (CNPJ automático, documento/Nexus, tudo) em vez do
  // mini-formulário de antes — navega na mesma aba, a pedido do usuário.
  const abrirCadastroCliente = (nomeInicial = '') => {
    const url = `/customers?novo=1${nomeInicial ? `&nome=${encodeURIComponent(nomeInicial)}` : ''}`;
    window.location.href = url;
  };

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

  // Catálogo pequeno (poucos produtos) não precisa de busca — todo mundo já cabe na
  // tela, o campo só ocupava espaço. Com catálogo grande (ex: pacotes de mídia da rádio),
  // a busca volta sozinha.
  const servicosVenda = servicos.filter(s => !ehMateriaPrima(s) && (!s.unidade || s.unidade === unidadeSel));
  const catalogoGrande = servicosVenda.length > 6;
  const servicosFiltrados = servicosVenda.filter(s => {
    if (!catalogoGrande || !busca.trim()) return true;
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

  const abrirConfigurador = (s: ServicoConfig, extrasIniciais: ConfiguracaoItem[] = [], editando = false) => {
    setProdutoDetalhe(s); setCriandoPersonalizado(false);
    setExtrasConfigurando(extrasIniciais);
    setNovoExtraDescricao(''); setNovoExtraValor('');
    setEditandoServicoId(editando ? s.id : null);
  };

  // Trailer 100% sob medida — não é nenhum dos modelos do catálogo, é um projeto novo do
  // zero. Mesmo configurador de sempre, só que nome/preço/prazo nascem em branco e ficam
  // editáveis (pra um produto de catálogo isso é fixo, vem do cadastro). Reaproveita o id
  // negativo do item avulso — nunca colide com servico real, nunca vira FK.
  const abrirCriarPersonalizado = () => {
    const id = proximoIdAvulsoRef.current--;
    setProdutoDetalhe({ id, nome: '', preco: 0, estoque: null, prazo_fabricacao_dias: null });
    setCriandoPersonalizado(true);
    setExtrasConfigurando([]);
    setNovoExtraDescricao(''); setNovoExtraValor('');
    setEditandoServicoId(null);
  };

  const adicionarExtraConfiguracao = () => {
    const valor = Number(novoExtraValor);
    if (!novoExtraDescricao.trim() || !valor) return;
    setExtrasConfigurando(prev => [...prev, { chave: novaChaveExtra(), descricao: novoExtraDescricao.trim(), valor }]);
    setNovoExtraDescricao(''); setNovoExtraValor('');
  };
  const removerExtraConfiguracao = (chave: string) => setExtrasConfigurando(prev => prev.filter(e => e.chave !== chave));

  // Confirma o item sob configuração — soma quantidade se já existia igual no carrinho
  // (sem editar), ou substitui a linha inteira se veio de "editar" um item já existente.
  const confirmarConfiguracao = () => {
    if (!produtoDetalhe) return;
    if (criandoPersonalizado && (!produtoDetalhe.nome.trim() || !(produtoDetalhe.preco > 0))) return;
    const s = produtoDetalhe;
    const extras = extrasConfigurando.length > 0 ? extrasConfigurando : undefined;
    setCarrinho(prev => {
      if (editandoServicoId != null) {
        return prev.map(i => i.servicoId === editandoServicoId
          ? { ...i, nome: s.nome, precoUnitario: s.preco, configuracoes: extras, prazoFabricacaoDias: s.prazo_fabricacao_dias ?? null, descricao: s.descricao ?? null }
          : i);
      }
      const existente = !criandoPersonalizado ? prev.find(i => i.servicoId === s.id) : undefined;
      if (existente) {
        return prev.map(i => i.servicoId === s.id ? { ...i, quantidade: i.quantidade + 1, configuracoes: extras ?? i.configuracoes } : i);
      }
      return [...prev, {
        servicoId: s.id, nome: s.nome, quantidade: 1, precoUnitario: s.preco, estoqueMax: s.estoque ?? null,
        configuracoes: extras, avulso: criandoPersonalizado || undefined,
        prazoFabricacaoDias: criandoPersonalizado ? (s.prazo_fabricacao_dias ?? null) : undefined,
        descricao: s.descricao ?? undefined,
      }];
    });
    setProdutoDetalhe(null); setEditandoServicoId(null); setExtrasConfigurando([]); setCriandoPersonalizado(false);
  };

  const valorExtras = (i: ItemCarrinho) => (i.configuracoes || []).reduce((s, c) => s + c.valor, 0);

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


  const subtotal = carrinho.reduce((acc, i) => acc + (i.precoUnitario + valorExtras(i)) * i.quantidade, 0);
  const total = Math.max(0, subtotal - desconto + acrescimo);

  // Prazo de entrega estimado — pega o MAIOR prazo de fabricação entre os itens sob
  // encomenda do carrinho (o pedido só sai quando todo item estiver pronto, não faz
  // sentido prometer a data do mais rápido). Item avulso/personalizado e produto com
  // estoque pronto não têm prazo de fabricação, ficam de fora da conta.
  const prazoEstimado = useMemo(() => {
    const servicoPorId = new Map(servicos.map(s => [s.id, s]));
    const prazos = carrinho
      .map(i => i.avulso ? i.prazoFabricacaoDias : servicoPorId.get(i.servicoId)?.prazo_fabricacao_dias)
      .filter((d): d is number => typeof d === 'number' && d > 0);
    if (prazos.length === 0) return null;
    const maiorPrazo = Math.max(...prazos);
    const data = new Date(agora);
    data.setDate(data.getDate() + maiorPrazo);
    return { dias: maiorPrazo, data };
  }, [carrinho, servicos, agora]);

  const resetar = () => {
    setCarrinho([]); setDesconto(0); setAcrescimo(0); setClienteSelecionado(null); setClienteQuery('');
    setFormaPagamento('pix'); setErro(null); setVendaConcluida(null);
    setProducoesIniciadas([]); setOrcamentoEditandoId(null);
  };

  // Reabre um orçamento salvo pra edição — itens voltam como linha avulsa (não dá pra
  // recuperar o servicoId original, leads.itens só guarda nome/preço/qtd como snapshot da
  // venda), então perde o vínculo com o catálogo mas mantém tudo editável na mesma tela.
  const editarOrcamento = async (h: any) => {
    // Se a telinha de "venda concluída" de uma ação anterior ainda estava na tela, ela
    // continuava aparecendo por cima do carrinho mesmo depois de clicar em Editar — os
    // dados carregavam certo por baixo, mas só apareciam depois de sair da telinha (ex:
    // clicando "Nova venda") e clicar em Editar de novo. Isso sai daquela tela na hora.
    setVendaConcluida(null);
    const itens = Array.isArray(h.itens) ? h.itens : [];
    setCarrinho(itens.map((it: any) => ({
      servicoId: proximoIdAvulsoRef.current--, nome: it.servico, quantidade: it.quantidade,
      precoUnitario: it.precoUnitario, estoqueMax: null, avulso: true, descricao: it.descricao ?? null,
    })));
    const descontoOriginal = Number(h.desconto) || 0;
    setDesconto(descontoOriginal);
    // Acréscimo nunca foi salvo no banco (só desconto e o valor_total final) — sem
    // reconstruir aqui, reabrir um orçamento que tinha acréscimo zerava o valor dele na
    // tela (ex: R$ 189.900 virando R$ 169.900), e salvar de novo gravava o total errado.
    // subtotal - desconto + acréscimo = valor_total  →  acréscimo = valor_total - subtotal + desconto.
    const subtotalReconstruido = itens.reduce((s: number, it: any) => s + (Number(it.precoUnitario) || 0) * (Number(it.quantidade) || 1), 0);
    setAcrescimo(Math.max(0, (Number(h.valor_total) || 0) - subtotalReconstruido + descontoOriginal));
    if (h.forma_pagamento) setFormaPagamento(h.forma_pagamento);
    if (h.client_id) {
      const { data: cliente } = await supabase.from('clientes').select('*').eq('id', h.client_id).single();
      if (cliente) setClienteSelecionado(cliente as ClienteOpcao);
    }
    setOrcamentoEditandoId(h.id);
    setMostrarHistorico(false);
    setErro(null);
  };

  // Vem do botão "Editar" em /pulse (Painel → Orçamentos em aberto) — busca o orçamento
  // direto (essa aba não carrega o histórico sozinha) e já abre pra edição. Depende do
  // valor do parâmetro (não de [] fixo) — sem isso, voltar pra essa mesma tela clicando em
  // "Editar" de novo (Next.js às vezes reaproveita a instância já montada em vez de
  // recarregar do zero) fazia o parâmetro novo ser ignorado.
  //
  // Também espera perfil?.empresa_id estar pronto antes de buscar — numa página recém
  // carregada (link direto do Painel), a sessão do Supabase ainda pode não ter terminado
  // de restaurar nesse exato momento; buscando cedo demais, o RLS filtra tudo em silêncio
  // (sem erro, só devolve vazio), a tela fica parecendo um Nova Venda em branco normal, e
  // só um segundo clique em Editar (já com a sessão pronta) realmente carregava o orçamento.
  const editarOrcamentoParam = searchParams.get('editarOrcamento');
  useEffect(() => {
    if (!editarOrcamentoParam || !perfil?.empresa_id) return;
    supabase.from('leads').select('id, empresa, valor_total, status, itens, created_at, forma_pagamento, cnpj, client_id, desconto')
      .eq('id', Number(editarOrcamentoParam)).single()
      .then(({ data }) => { if (data) editarOrcamento(data); });
    window.history.replaceState({}, '', '/pulse/nova-venda');
  }, [editarOrcamentoParam, perfil?.empresa_id]);

  const finalizarVenda = async (modo: 'orcamento' | 'pedido') => {
    setErro(null);
    if (!clienteSelecionado) { setErro('Selecione ou cadastre o cliente.'); return; }
    if (carrinho.length === 0) { setErro('Adicione pelo menos um item.'); return; }

    setSalvando(true);
    try {
      const clientId = clienteSelecionado.id;
      const nomeCliente = clienteSelecionado.nome_empresa;

      // Extras de configuração viram parte do preço unitário e ficam listados no nome do
      // item — assim aparecem automaticamente no recibo/orçamento e no histórico sem
      // precisar mudar imprimirReciboOuOrcamento ou o formato salvo em leads.itens.
      // descricao/imagemUrl gravados junto (não só o id) porque o orçamento impresso
      // precisa mostrar as specs completas mesmo se o produto for editado/removido do
      // catálogo depois — leads.itens é o snapshot da venda no momento em que foi feita.
      const itensPayload = carrinho.map(i => {
        const servicoOriginal = servicos.find(s => s.id === i.servicoId);
        return {
          servico: i.configuracoes?.length ? `${i.nome} (${i.configuracoes.map(c => c.descricao).join(', ')})` : i.nome,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario + valorExtras(i),
          descricao: i.descricao ?? servicoOriginal?.descricao ?? null,
          imagemUrl: servicoOriginal?.imagem_url || null,
        };
      });

      // Editando um orçamento já salvo — atualiza a mesma linha em vez de criar venda
      // nova, e não dispara nenhum dos efeitos de "pedido" (lançamento, produção, baixa de
      // estoque) porque orçamento em edição continua sendo só orçamento, nunca vira pedido
      // por aqui — conversão pra pedido é outro fluxo (Painel), fora do escopo dessa edição.
      if (orcamentoEditandoId) {
        const { data: leadAtualizado, error: erroUpdate } = await supabase.from('leads').update({
          empresa: nomeCliente, telefone: clienteSelecionado.telefone || null, cnpj: clienteSelecionado.cnpj || null,
          valor_total: total, desconto, itens: itensPayload,
          unidade: unidadeSel || null, forma_pagamento: formaPagamento, client_id: clientId,
        }).eq('id', orcamentoEditandoId).select().single();
        if (erroUpdate) throw erroUpdate;
        setVendaConcluida({ ...leadAtualizado, empresa: nomeCliente, itens: itensPayload, status: 'orcamento' });
        setOrcamentoEditandoId(null);
        if (mostrarHistorico) carregarHistorico();
        setSalvando(false);
        return;
      }

      const { data: leadData, error: erroLead } = await supabase.from('leads').insert([{
        empresa: nomeCliente,
        telefone: clienteSelecionado.telefone || null,
        cnpj: clienteSelecionado.cnpj || null,
        valor_total: total,
        desconto,
        itens: itensPayload,
        status: modo === 'pedido' ? 'ganho' : 'orcamento',
        etapa: modo === 'pedido' ? 4 : 0,
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

      if (modo === 'pedido') {
        await Promise.all([
          supabase.from('lancamentos').insert([{
            titulo: `VENDA RÁPIDA: ${nomeCliente} (${unidadeSel || 'Geral'}) - OS: ${formatId(leadData.id)}`,
            valor: total, tipo: 'entrada', categoria: 'vendas', status: 'pendente',
            data_vencimento: new Date().toISOString().split('T')[0],
            user_id: user?.id, empresa_id: perfil?.empresa_id,
          }]),
          // Venda fechada direto no Pulse não passa pelo check-in manual de /visitas — sem isso,
          // ranking e relatórios de visita zeravam pra quem vende só por aqui.
          supabase.from('visitas').insert([{
            empresa: nomeCliente, telefone: clienteSelecionado.telefone || null,
            observacao: `Venda Pulse — OS ${formatId(leadData.id)}`,
            user_id: vendedorId || user?.id, empresa_id: perfil?.empresa_id, unidade: unidadeSel || null,
            lead_id: leadData.id,
          }]),
          ...carrinho.filter(i => i.estoqueMax !== null).flatMap(i => {
            const novo = Math.max(0, (i.estoqueMax as number) - i.quantidade);
            const deltaReal = novo - (i.estoqueMax as number);
            const minimo = servicos.find(s => s.id === i.servicoId)?.estoque_minimo ?? 5;
            alertarEstoqueBaixoSeCruzou(i.servicoId, i.estoqueMax as number, novo, minimo);
            return [
              supabase.from('servicos').update({ estoque: novo }).eq('id', i.servicoId),
              supabase.from('estoque_movimentacoes').insert([{
                empresa_id: perfil?.empresa_id, servico_id: i.servicoId, quantidade: deltaReal,
                tipo: 'venda', lead_id: leadData.id, observacao: `Venda Pulse — OS ${formatId(leadData.id)}`, user_id: user?.id,
              }]),
            ];
          }),
        ]);
        setServicos(prev => prev.map(s => {
          const item = carrinho.find(i => i.servicoId === s.id);
          return item && s.estoque !== null && s.estoque !== undefined ? { ...s, estoque: Math.max(0, s.estoque - item.quantidade) } : s;
        }));

        // Produto sob encomenda com ficha técnica: produção nasce sozinha, direto em
        // "Em produção" — ninguém passa pelo form manual de novo. Mapa com cópias (não as
        // referências de `servicos`) porque duas produções desta MESMA venda podem
        // compartilhar matéria-prima — sem atualizar o estoque local entre elas, a segunda
        // chamada partiria do estoque de antes da primeira e sobrescreveria o desconto dela.
        const servicoPorId = new Map(servicos.map(s => [s.id, { ...s }]));
        const itensSobEncomenda = carrinho.filter(i => {
          const s = servicoPorId.get(i.servicoId);
          return s && ehSobEncomenda(s);
        });
        const resultados: { nome: string; ok: boolean }[] = [];
        for (const item of itensSobEncomenda) {
          const produtoFinal = servicoPorId.get(item.servicoId)!;
          // Sem ficha técnica cadastrada, fichaItens fica vazio — a produção nasce igual,
          // só não consome matéria-prima nenhuma automaticamente (registrarProducaoAutomatica
          // já lida bem com lista vazia).
          const fichaItens = fichasPorProduto.get(item.servicoId) || [];
          try {
            await registrarProducaoAutomatica({
              empresaId: perfil?.empresa_id, produtoFinal, quantidadeProduzida: item.quantidade,
              fichaItens, materiaPrimaPorId: servicoPorId,
              userId: user?.id, responsavelId: vendedorId || user?.id, leadId: leadData.id, status: 'em_producao',
            });
            for (const fi of fichaItens) {
              const mp = servicoPorId.get(fi.servicoId);
              if (mp && mp.estoque !== null && mp.estoque !== undefined) {
                mp.estoque = Math.max(0, mp.estoque - fi.quantidadePorUnidade * item.quantidade);
              }
            }
            resultados.push({ nome: item.nome, ok: true });
          } catch {
            resultados.push({ nome: item.nome, ok: false });
          }
        }
        setProducoesIniciadas(resultados);
      }

      setVendaConcluida({ ...leadData, empresa: nomeCliente, itens: itensPayload, status: modo === 'pedido' ? 'ganho' : 'orcamento' });
      if (mostrarHistorico) carregarHistorico();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  // venda-alvo das 3 ações (contrato/NF/cobrança) — normalmente a que acabou de fechar
  // (vendaConcluida), mas também pode ser uma linha antiga clicada no histórico, já que
  // a telinha de sucesso desaparece assim que sai dela.
  const abrirContrato = (venda: any = vendaConcluida) => {
    setVendaAlvo(venda);
    setContratoEmail(venda?.id === vendaConcluida?.id ? (clienteSelecionado?.email || '') : '');
    setContratoTelefone(venda?.id === vendaConcluida?.id ? (clienteSelecionado?.telefone || '') : '');
    setContratoErro(null);
    setContratoLinks(null);
    setContratoAberto(true);
  };

  const enviarContrato = async () => {
    if (!contratoEmail.trim()) { setContratoErro('Informe o e-mail do cliente — o Docuseal manda o link de assinatura por lá.'); return; }
    if (!vendaAlvo) return;
    setEnviandoContrato(true); setContratoErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/docuseal/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          empresa_id: perfil?.empresa_id,
          venda: {
            id: vendaAlvo.id, empresa: vendaAlvo.empresa, cnpj: vendaAlvo.cnpj,
            telefone: contratoTelefone || vendaAlvo.telefone,
            endereco: clienteSelecionado?.endereco, cidade: clienteSelecionado?.cidade,
            itens: vendaAlvo.itens, desconto: vendaAlvo.desconto || 0, valor_total: vendaAlvo.valor_total,
            parcelas: vendaAlvo.parcelas || '1', forma_pagamento: vendaAlvo.forma_pagamento,
            prazoFabricacaoDias: prazoEstimado?.dias ?? null, unidade: vendaAlvo.unidade || unidadeSel,
          },
          signers: [{ name: vendaAlvo.empresa, email: contratoEmail.trim(), phone: contratoTelefone }],
          consultor: { nome: perfil?.nome || 'Vendedor', email: user?.email },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao gerar contrato.');
      setContratoLinks({ consultorSignUrl: json.consultor_sign_url, signUrl: json.sign_url });
    } catch (err: any) {
      setContratoErro(err?.message || 'Erro ao gerar contrato.');
    } finally {
      setEnviandoContrato(false);
    }
  };

  const emitirNf1 = async (venda: any = vendaConcluida) => {
    if (!venda) return;
    setEmitindoNf(true); setNfErro(null); setNfEmitida(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/pulse/fiscal/emitir-nf1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ leadId: venda.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao emitir a NF.');
      setNfEmitida(true);
      // Vindo do histórico não tem o card de sucesso pra mostrar o aviso inline.
      if (venda.id !== vendaConcluida?.id) alert('NF enviada pra SEFAZ. Confirmação de autorização chega em /pulse/fiscal em alguns segundos.');
    } catch (err: any) {
      setNfErro(err?.message || 'Erro ao emitir a NF.');
      if (venda.id !== vendaConcluida?.id) alert(`Erro ao emitir a NF: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setEmitindoNf(false);
    }
  };

  const abrirCobranca = (venda: any = vendaConcluida) => {
    if (!venda) return;
    setVendaAlvo(venda);
    setCobrancaValor(String(venda.valor_total));
    setCobrancaVencimento(new Date().toISOString().split('T')[0]);
    setCobrancaParcelas('1');
    setCobrancaErro(null);
    setCobrancaResultado(null);
    setCobrancaAberto(true);
  };

  // Espelha uma mudança em cobrancas_manuais nos três lugares que podem estar
  // mostrando a mesma venda na tela (modal aberto, tela pós-venda, linha do histórico)
  // sem precisar recarregar do banco.
  const atualizarCobrancasLocal = (leadId: number, transformar: (lista: any[]) => any[]) => {
    setVendaAlvo((v: any) => v && v.id === leadId ? { ...v, cobrancas_manuais: transformar(v.cobrancas_manuais || []) } : v);
    setVendaConcluida((v: any) => v && v.id === leadId ? { ...v, cobrancas_manuais: transformar(v.cobrancas_manuais || []) } : v);
    setHistorico(hs => hs.map(h => h.id === leadId ? { ...h, cobrancas_manuais: transformar(h.cobrancas_manuais || []) } : h));
  };

  const cancelarCobranca = async (asaasPaymentId: string) => {
    if (!vendaAlvo) return;
    if (!confirm('Cancelar esta cobrança? Essa ação não pode ser desfeita na Asaas.')) return;
    setCancelandoCobranca(asaasPaymentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/financeiro/cobranca', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ leadId: vendaAlvo.id, asaasPaymentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao cancelar cobrança.');
      atualizarCobrancasLocal(vendaAlvo.id, lista => lista.map((c: any) =>
        c.asaasPaymentId === asaasPaymentId ? { ...c, cancelada: true, canceladoEm: new Date().toISOString() } : c
      ));
    } catch (err: any) {
      alert(err?.message || 'Erro ao cancelar cobrança.');
    } finally {
      setCancelandoCobranca(null);
    }
  };

  // Divide o valor total em N parcelas mensais iguais (a última absorve a
  // diferença de centavos do arredondamento) a partir do 1º vencimento informado.
  const calcularParcelas = (valorTotal: number, qtd: number, primeiroVencimento: string) => {
    const centavosTotal = Math.round(valorTotal * 100);
    const centavosParcela = Math.floor(centavosTotal / qtd);
    const parcelas: { valor: number; vencimento: string }[] = [];
    const dataBase = new Date(primeiroVencimento + 'T00:00:00');
    for (let i = 0; i < qtd; i++) {
      const centavos = i === qtd - 1 ? centavosTotal - centavosParcela * (qtd - 1) : centavosParcela;
      const data = new Date(dataBase);
      data.setMonth(data.getMonth() + i);
      parcelas.push({ valor: centavos / 100, vencimento: data.toISOString().split('T')[0] });
    }
    return parcelas;
  };

  const gerarCobranca = async () => {
    if (!vendaAlvo) return;
    const cpfCnpj = vendaAlvo.cnpj || clienteSelecionado?.cnpj;
    if (!cpfCnpj) { setCobrancaErro('Cliente sem CPF/CNPJ cadastrado — necessário pro Asaas.'); return; }
    if (!cobrancaValor || Number(cobrancaValor) <= 0) { setCobrancaErro('Informe um valor válido.'); return; }
    if (!cobrancaVencimento) { setCobrancaErro('Informe o vencimento.'); return; }
    const qtdParcelas = Math.max(1, Number(cobrancaParcelas) || 1);
    setEnviandoCobranca(true); setCobrancaErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const parcelas = qtdParcelas > 1 ? calcularParcelas(Number(cobrancaValor), qtdParcelas, cobrancaVencimento) : undefined;
      const res = await fetch('/api/financeiro/cobranca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          leadId: vendaAlvo.id, nome: vendaAlvo.empresa, cpfCnpj,
          email: clienteSelecionado?.email, valor: Number(cobrancaValor), vencimento: cobrancaVencimento, tipo: cobrancaTipo,
          ...(parcelas ? { parcelas } : {}),
        }),
      });
      const json = await res.json();
      // Mesmo se falhou no meio (ex: parcela 3 de 5 deu erro), a rota já salvou as
      // que geraram de verdade na Asaas antes de responder — reflete essas aqui
      // também, não só no caminho de sucesso, senão o registro local fica incompleto.
      const resultados: any[] = json.parcelas || [];
      if (resultados.length > 0) {
        const novasCobrancas = resultados.map(r => ({
          asaasPaymentId: r.paymentId, parcela: r.parcela, tipo: r.tipo, valor: r.valor, vencimento: r.vencimento,
          geradoEm: new Date().toISOString(), invoiceUrl: r.invoiceUrl, bankSlipUrl: r.bankSlipUrl,
          linhaDigitavel: r.linhaDigitavel, pixPayload: r.pixPayload,
        }));
        atualizarCobrancasLocal(vendaAlvo.id, lista => [...lista, ...novasCobrancas]);
      }
      if (!res.ok) throw new Error(json.erro || 'Erro ao gerar cobrança.');
      setCobrancaResultado(resultados);
    } catch (err: any) {
      setCobrancaErro(err?.message || 'Erro ao gerar cobrança.');
    } finally {
      setEnviandoCobranca(false);
    }
  };

  // Extraído em função (em vez de JSX duplicado) porque os 2 modais precisam aparecer
  // tanto na telinha de sucesso quanto na tela principal (acionados pelo histórico).
  const renderModalContrato = () => contratoAberto && (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !enviandoContrato && setContratoAberto(false)}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-left" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><PenTool size={18} className="text-purple-400" /> Contrato</h3>
          <button onClick={() => setContratoAberto(false)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {contratoLinks ? (
          <div className="space-y-3">
            <p className="text-[var(--cor-primaria)] text-xs font-bold">Contrato gerado! Assine primeiro, depois o cliente recebe o link por e-mail automaticamente.</p>
            <a href={contratoLinks.consultorSignUrl} target="_blank" rel="noopener noreferrer" className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              <PenTool size={14} /> Assinar agora (vendedor)
            </a>
            <button onClick={() => setContratoAberto(false)} className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase text-xs py-3 rounded-xl">Fechar</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-500 text-xs font-bold">Minuta padrão de compra e venda — revisar com o jurídico antes do primeiro uso oficial. Vendedor assina primeiro, cliente recebe por e-mail em seguida.</p>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">E-mail do cliente</label>
              <input type="email" value={contratoEmail} onChange={e => setContratoEmail(e.target.value)} placeholder="cliente@email.com" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">WhatsApp (opcional)</label>
              <input value={contratoTelefone} onChange={e => setContratoTelefone(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
            </div>
            {contratoErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{contratoErro}</div>}
            <button onClick={enviarContrato} disabled={enviandoContrato} className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              {enviandoContrato ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
              {enviandoContrato ? 'Gerando...' : 'Gerar e enviar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderModalCobranca = () => cobrancaAberto && (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !enviandoCobranca && setCobrancaAberto(false)}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-left" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Zap size={18} className="text-emerald-400" /> Cobrança</h3>
          <button onClick={() => setCobrancaAberto(false)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {Array.isArray(vendaAlvo?.cobrancas_manuais) && vendaAlvo.cobrancas_manuais.length > 0 && (
          <div className="mb-4 space-y-2 max-h-40 overflow-y-auto">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Já geradas</p>
            {[...vendaAlvo.cobrancas_manuais].reverse().map((c: any, idx: number) => (
              <div key={idx} className="bg-black/30 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate ${c.cancelada ? 'text-slate-500 line-through' : 'text-white'}`}>{c.tipo}{c.parcela ? ` · parcela ${c.parcela}` : ''} · R$ {Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-slate-500 text-[10px]">Vence {c.vencimento ? new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                </div>
                {c.cancelada ? (
                  <span className="flex-shrink-0 text-slate-500 text-[10px] font-black uppercase">Cancelada</span>
                ) : (
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {(c.bankSlipUrl || c.invoiceUrl) && (
                      <a href={c.bankSlipUrl || c.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-[10px] font-black uppercase">Abrir ↗</a>
                    )}
                    <button
                      onClick={() => cancelarCobranca(c.asaasPaymentId)}
                      disabled={cancelandoCobranca === c.asaasPaymentId}
                      className="text-red-400 hover:text-red-300 disabled:opacity-50 text-[10px] font-black uppercase"
                    >
                      {cancelandoCobranca === c.asaasPaymentId ? '...' : 'Cancelar'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {cobrancaResultado ? (
          <div className="space-y-3">
            <p className="text-emerald-400 text-xs font-bold">{cobrancaResultado.length > 1 ? `${cobrancaResultado.length} cobranças geradas!` : 'Cobrança gerada!'}</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cobrancaResultado.map((r, idx) => (
                <div key={idx} className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-2">
                  {r.parcela && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Parcela {r.parcela}</p>}
                  <p className="text-white text-xs font-bold">R$ {Number(r.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  {r.tipo === 'PIX' && r.pixPayload && (
                    <div>
                      <p className="text-white text-[10px] font-mono break-all">{r.pixPayload}</p>
                      <button onClick={() => navigator.clipboard.writeText(r.pixPayload || '')} className="mt-1.5 w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase text-[10px] py-2 rounded-lg flex items-center justify-center gap-1.5">
                        <Copy size={11} /> Copiar
                      </button>
                    </div>
                  )}
                  {r.tipo === 'BOLETO' && r.linhaDigitavel && (
                    <div>
                      <p className="text-white text-[10px] font-mono break-all">{r.linhaDigitavel}</p>
                      <button onClick={() => navigator.clipboard.writeText(r.linhaDigitavel || '')} className="mt-1.5 w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase text-[10px] py-2 rounded-lg flex items-center justify-center gap-1.5">
                        <Copy size={11} /> Copiar
                      </button>
                    </div>
                  )}
                  {(r.bankSlipUrl || r.invoiceUrl) && (
                    <a href={r.bankSlipUrl || r.invoiceUrl || '#'} target="_blank" rel="noopener noreferrer" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] py-2.5 rounded-xl flex items-center justify-center gap-2">
                      Abrir cobrança
                    </a>
                  )}
                </div>
              ))}
            </div>
            {cobrancaErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{cobrancaErro}</div>}
            <button onClick={() => { setCobrancaAberto(false); setCobrancaResultado(null); }} className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase text-xs py-3 rounded-xl">Fechar</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex bg-black/30 border border-white/10 rounded-xl p-1 gap-1">
              {(['PIX', 'BOLETO'] as const).map(t => (
                <button key={t} type="button" onClick={() => setCobrancaTipo(t)} className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${cobrancaTipo === t ? 'bg-emerald-500 text-[#0B1120]' : 'text-slate-400 hover:bg-white/5'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">{Number(cobrancaParcelas) > 1 ? 'Valor total (R$)' : 'Valor (R$)'}</label>
              <input type="number" step="0.01" value={cobrancaValor} onChange={e => setCobrancaValor(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">{Number(cobrancaParcelas) > 1 ? '1º vencimento' : 'Vencimento'}</label>
              <input type="date" value={cobrancaVencimento} onChange={e => setCobrancaVencimento(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Parcelas</label>
              <input type="number" min="1" step="1" value={cobrancaParcelas} onChange={e => setCobrancaParcelas(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-emerald-500" />
              {Number(cobrancaParcelas) > 1 && Number(cobrancaValor) > 0 && (
                <p className="text-slate-500 text-[10px] mt-1.5">
                  {cobrancaParcelas}x de ~R$ {(Number(cobrancaValor) / Number(cobrancaParcelas)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, mensal a partir do 1º vencimento — gera {cobrancaParcelas} {cobrancaTipo.toLowerCase()}s separados.
                </p>
              )}
            </div>
            {cobrancaErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{cobrancaErro}</div>}
            <button onClick={gerarCobranca} disabled={enviandoCobranca} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              {enviandoCobranca ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {enviandoCobranca ? 'Gerando...' : Number(cobrancaParcelas) > 1 ? `Gerar ${cobrancaParcelas} ${cobrancaTipo.toLowerCase()}s` : `Gerar ${cobrancaTipo}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );

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

  if (vendaConcluida) {
    const ehOrcamento = vendaConcluida.status === 'orcamento';
    return (
      <div className="p-4 md:p-8 pb-20 text-white flex items-center justify-center min-h-[70vh]">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center">
          <CheckCircle2 size={40} className={`mx-auto mb-3 ${ehOrcamento ? 'text-purple-400' : 'text-[var(--cor-primaria)]'}`} />
          <p className="text-white font-black text-lg uppercase">{ehOrcamento ? 'Orçamento salvo!' : 'Venda registrada!'}</p>
          <p className="text-slate-400 text-sm mt-1">{formatId(vendaConcluida.id)} · {vendaConcluida.empresa}</p>
          <p className={`text-3xl font-black mt-4 ${ehOrcamento ? 'text-purple-400' : 'text-[var(--cor-primaria)]'}`}>R$ {vendaConcluida.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          {ehOrcamento && <p className="text-slate-500 text-[10px] mt-2">Sem efeito no estoque/financeiro ainda — converte em pedido no Painel quando o cliente aprovar.</p>}

          {!ehOrcamento && producoesIniciadas.length > 0 && (
            <div className="mt-5 pt-5 border-t border-white/5 space-y-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-left">Produção</p>
              {producoesIniciadas.map((p, idx) => (
                <div key={idx} className={`w-full flex items-center justify-between gap-2 border rounded-xl px-3 py-2.5 text-left ${p.ok ? 'bg-white/5 border-white/10' : 'bg-red-500/10 border-red-500/20'}`}>
                  <span className="text-white text-xs font-bold truncate">{p.nome}</span>
                  <span className={`flex items-center gap-1 text-[10px] font-black uppercase flex-shrink-0 ${p.ok ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>
                    <Factory size={12} /> {p.ok ? 'Iniciada' : 'Falhou'}
                  </span>
                </div>
              ))}
              <Link href="/pulse/producao" className="block text-center text-[10px] font-black text-[var(--cor-primaria)] uppercase tracking-widest pt-1">
                Acompanhar no fluxo de produção →
              </Link>
            </div>
          )}

          {!ehOrcamento && (
            <button onClick={() => abrirContrato()} className="w-full mt-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              <PenTool size={14} /> Gerar contrato pra assinar
            </button>
          )}

          {!ehOrcamento && (
            <div className="mt-2">
              <button
                onClick={() => emitirNf1()} disabled={emitindoNf || nfEmitida}
                className="w-full bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 border border-blue-500/30 text-blue-300 font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                {emitindoNf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {nfEmitida ? 'NF enviada pra SEFAZ' : 'Emitir NF (entrega futura)'}
              </button>
              {nfErro && <p className="text-red-400 text-[10px] font-bold mt-1.5">{nfErro}</p>}
              {nfEmitida && <p className="text-slate-500 text-[10px] mt-1.5">Confirmação de autorização chega em /pulse/fiscal em alguns segundos.</p>}
            </div>
          )}

          {!ehOrcamento && (
            <button onClick={() => abrirCobranca()} className="w-full mt-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              <Zap size={14} /> Gerar boleto ou Pix
            </button>
          )}

          <div className="flex gap-2 mt-2">
            <button onClick={() => imprimirReciboOuOrcamento(vendaConcluida, unidades.find(u => u.nome === unidadeSel), empresa)} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              <Printer size={14} /> {ehOrcamento ? 'Orçamento' : 'Recibo'}
            </button>
            <button onClick={resetar} className="flex-1 bg-[var(--cor-primaria)] hover:bg-[#16A34A] text-[#0B1120] font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              <Plus size={14} /> Nova venda
            </button>
          </div>
        </div>

        {renderModalContrato()}
        {renderModalCobranca()}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <ShoppingBag size={32} /> Nova Venda
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Monte o pedido e feche na hora — ou salve como orçamento</p>
        </div>
        <button onClick={toggleHistorico} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all self-start md:self-auto">
          <History size={14} /> Histórico de vendas {mostrarHistorico ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </header>

      {mostrarHistorico && (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden mb-5">
          <div className="p-5 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="font-black uppercase text-sm text-slate-300">Vendas e orçamentos recentes</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase mt-0.5">Faturado no período exibido: <span className="text-[var(--cor-primaria)]">R$ {totalHistoricoFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
            </div>
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[var(--cor-primaria)]">
              <Search size={13} className="text-slate-500 flex-shrink-0" />
              <input value={buscaHistorico} onChange={e => setBuscaHistorico(e.target.value)} placeholder="Cliente ou protocolo..." className="flex-1 bg-transparent outline-none text-white text-xs w-40" />
            </div>
          </div>
          {carregandoHistorico ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
          ) : historicoFiltrado.length === 0 ? (
            <div className="p-8 text-center"><p className="text-slate-500 text-sm font-bold">{historico.length === 0 ? 'Nenhuma venda registrada ainda por aqui.' : 'Nada encontrado pra essa busca.'}</p></div>
          ) : (
            <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
              {historicoFiltrado.map(h => {
                const ehOrc = h.status === 'orcamento';
                const itens = Array.isArray(h.itens) ? h.itens : [];
                return (
                  <div key={h.id} className="flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">{formatId(h.id)} · {h.empresa}</p>
                      <p className="text-slate-500 text-[10px] truncate">
                        {itens.map((it: any) => `${it.quantidade}x ${it.servico}`).join(', ')} · {new Date(h.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full flex-shrink-0 ${ehOrc ? 'text-purple-400 bg-purple-500/10' : 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]'}`}>
                      {ehOrc ? 'Orçamento' : 'Venda'}
                    </span>
                    <span className="text-white font-black text-sm flex-shrink-0 whitespace-nowrap text-right">R$ {Number(h.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    {!ehOrc && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => abrirContrato(h)} title="Gerar contrato" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-purple-500/10 text-slate-600 hover:text-purple-400"><PenTool size={13} /></button>
                        <button onClick={() => emitirNf1(h)} title="Emitir NF" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-500/10 text-slate-600 hover:text-blue-400"><FileText size={13} /></button>
                        <button onClick={() => abrirCobranca(h)} title="Gerar boleto/Pix" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400"><Zap size={13} /></button>
                      </div>
                    )}
                    {ehOrc && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => editarOrcamento(h)} title="Editar orçamento" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-500/10 text-slate-600 hover:text-amber-400"><Pencil size={13} /></button>
                        <button onClick={() => cancelarOrcamento(h.id)} disabled={cancelandoId === h.id} title="Cancelar orçamento" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 disabled:opacity-50">
                          {cancelandoId === h.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Cliente</label>
              {!clienteSelecionado && (
                <button onClick={() => abrirCadastroCliente()} className="text-[10px] font-black uppercase text-[var(--cor-primaria)] hover:brightness-110 flex items-center gap-1">
                  <UserPlus size={11} /> Cadastrar cliente
                </button>
              )}
            </div>
            {clienteSelecionado ? (
              <div className="flex items-center justify-between bg-[rgb(var(--cor-primaria-rgb)/10%)] border border-[rgb(var(--cor-primaria-rgb)/30%)] rounded-xl px-4 py-3">
                <div>
                  <p className="text-white font-bold text-sm">{clienteSelecionado.nome_empresa}</p>
                  {clienteSelecionado.telefone && <p className="text-slate-400 text-xs">{clienteSelecionado.telefone}</p>}
                </div>
                <button onClick={() => { setClienteSelecionado(null); setClienteQuery(''); }} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[var(--cor-primaria)]">
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
                        <button onClick={() => abrirCadastroCliente(clienteQuery.trim())} className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-[var(--cor-primaria)] font-black text-xs uppercase py-2.5 rounded-lg transition-colors">
                          <UserPlus size={13} /> Cadastrar &quot;{clienteQuery.trim()}&quot;
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5 relative">
            {catalogoGrande && (
              <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 mb-4 focus-within:border-[var(--cor-primaria)]">
                <Search size={14} className="text-slate-500 flex-shrink-0" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto no catálogo..." className="flex-1 bg-transparent outline-none text-white text-sm" />
              </div>
            )}
            {loadingServicos ? (
              <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-[32rem] overflow-y-auto pr-1">
                {servicosFiltrados.map(s => {
                  const semEstoque = s.estoque !== null && s.estoque !== undefined && s.estoque <= 0;
                  // Sob encomenda (trailer) abre o configurador — o clique rápido só faz
                  // sentido pra item de prateleira, onde não tem nada a personalizar.
                  const aoClicar = () => {
                    if (semEstoque) return;
                    if (ehSobEncomenda(s)) abrirConfigurador(s); else adicionarItem(s);
                  };
                  return (
                    <div
                      key={s.id} role="button" tabIndex={semEstoque ? -1 : 0}
                      onClick={aoClicar}
                      onKeyDown={e => { if (!semEstoque && (e.key === 'Enter' || e.key === ' ')) aoClicar(); }}
                      className={`relative text-left bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/20 rounded-2xl overflow-hidden transition-all ${semEstoque ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="h-36 bg-white/5 flex items-center justify-center overflow-hidden">
                        {s.imagem_url ? <img src={s.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={32} className="text-slate-600" />}
                      </div>
                      {s.descricao && !ehSobEncomenda(s) && (
                        <button
                          onClick={e => { e.stopPropagation(); abrirConfigurador(s); }}
                          title="Ver descrição completa"
                          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-full text-white transition-colors"
                        >
                          <Info size={14} />
                        </button>
                      )}
                      <div className="p-3">
                        <p className="text-white text-sm font-bold leading-snug">{s.nome}</p>
                        <p className="text-[var(--cor-primaria)] text-base font-black mt-1">A partir de R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {s.estoque !== null && s.estoque !== undefined ? (
                            <span className={`text-[9px] font-bold ${semEstoque ? 'text-red-400' : 'text-slate-500'}`}>{semEstoque ? 'Sem estoque' : `${s.estoque} disponível`}</span>
                          ) : s.prazo_fabricacao_dias ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded uppercase"><Factory size={9} /> ~{s.prazo_fabricacao_dias}d</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={abrirCriarPersonalizado}
                  className="flex flex-col items-center justify-center gap-2 h-full min-h-[13rem] border-2 border-dashed border-white/10 hover:border-[var(--cor-primaria)]/50 rounded-2xl text-slate-500 hover:text-[var(--cor-primaria)] transition-all"
                >
                  <Plus size={28} />
                  <span className="text-xs font-black uppercase tracking-widest text-center px-2">Produto<br />Personalizado</span>
                </button>
                {servicosFiltrados.length === 0 && <p className="col-span-full text-center text-slate-500 text-xs font-bold py-6">Nenhum produto encontrado.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Pedido</label>
              <button onClick={abrirCriarPersonalizado} className="text-[10px] font-black uppercase text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                <Plus size={11} /> Produto personalizado
              </button>
            </div>

            {carrinho.length === 0 ? (
              <p className="text-slate-500 text-xs font-bold text-center py-6">Nenhum item ainda.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {carrinho.map(i => {
                  const servicoOriginal = servicos.find(s => s.id === i.servicoId);
                  const podeConfigurar = i.avulso || (servicoOriginal && ehSobEncomenda(servicoOriginal));
                  const editarLinha = () => {
                    if (i.avulso) {
                      // Produto personalizado não tem cadastro no catálogo — reconstrói um
                      // objeto temporário com os dados já salvos na linha pra reabrir editável.
                      setProdutoDetalhe({ id: i.servicoId, nome: i.nome, preco: i.precoUnitario, estoque: null, prazo_fabricacao_dias: i.prazoFabricacaoDias ?? null, descricao: i.descricao ?? null });
                      setCriandoPersonalizado(true);
                      setExtrasConfigurando(i.configuracoes || []);
                      setNovoExtraDescricao(''); setNovoExtraValor('');
                      setEditandoServicoId(i.servicoId);
                    } else if (servicoOriginal) {
                      abrirConfigurador(servicoOriginal, i.configuracoes || [], true);
                    }
                  };
                  return (
                    <div key={i.servicoId} className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-white text-xs font-bold truncate">{i.nome}</p>
                            {i.avulso && <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded bg-white/10 text-slate-400 uppercase">Personalizado</span>}
                          </div>
                          <p className="text-slate-500 text-[10px]">R$ {(i.precoUnitario + valorExtras(i)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} un.</p>
                        </div>
                        {podeConfigurar && (
                          <button onClick={editarLinha} title="Editar" className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white shrink-0"><Pencil size={11} /></button>
                        )}
                        <button onClick={() => alterarQuantidade(i.servicoId, -1)} className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 shrink-0"><Minus size={12} /></button>
                        <span className="text-white text-xs font-black w-5 text-center shrink-0">{i.quantidade}</span>
                        <button onClick={() => alterarQuantidade(i.servicoId, 1)} disabled={i.estoqueMax !== null && i.quantidade >= i.estoqueMax} className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 disabled:opacity-30 shrink-0"><Plus size={12} /></button>
                        <button onClick={() => removerItem(i.servicoId)} className="text-slate-600 hover:text-red-400 p-1 shrink-0"><Trash2 size={13} /></button>
                      </div>
                      {i.configuracoes && i.configuracoes.length > 0 && (
                        <div className="mt-1.5 pl-2 border-l-2 border-white/10 space-y-0.5">
                          {i.configuracoes.map(ex => (
                            <p key={ex.chave} className="text-[10px] text-slate-500">
                              {ex.descricao} <span className={ex.valor >= 0 ? 'text-[var(--cor-primaria)]' : 'text-red-400'}>({ex.valor >= 0 ? '+' : ''}R$ {ex.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-white/5 pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-bold">Subtotal</span>
                <span className="text-white font-bold">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-bold text-xs">Desconto R$</span>
                <input type="number" value={desconto || ''} onChange={e => setDesconto(Math.max(0, Number(e.target.value) || 0))} className="w-24 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right outline-none focus:border-[var(--cor-primaria)]" placeholder="0" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-bold text-xs">Acréscimo R$</span>
                <input type="number" value={acrescimo || ''} onChange={e => setAcrescimo(Math.max(0, Number(e.target.value) || 0))} className="w-24 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right outline-none focus:border-[var(--cor-primaria)]" placeholder="0" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-white font-black uppercase text-sm">Total</span>
                <span className="text-[var(--cor-primaria)] font-black text-xl">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              {prazoEstimado && (
                <div className="flex items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mt-1">
                  <span className="text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Factory size={11} /> Previsão de entrega</span>
                  <span className="text-white text-xs font-black">{prazoEstimado.data.toLocaleDateString('pt-BR')} <span className="text-amber-400 font-bold">(~{prazoEstimado.dias}d)</span></span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5 space-y-3">
            {unidades.length > 1 && (
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Unidade</label>
                <select value={unidadeSel} onChange={e => setUnidadeSel(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[var(--cor-primaria)]">
                  {unidades.map(u => <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>)}
                </select>
              </div>
            )}
            {isLideranca && Object.keys(usersMap).length > 0 && (
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Vendedor</label>
                <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[var(--cor-primaria)]">
                  {Object.entries(usersMap).map(([id, nome]) => <option key={id} value={id} className="bg-[#0B1120]">{nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Pagamento</label>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(FORMAS_PAGAMENTO).map(([valor, label]) => (
                  <button key={valor} onClick={() => setFormaPagamento(valor)} className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${formaPagamento === valor ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {erro && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle size={14} className="flex-shrink-0" /> {erro}
            </div>
          )}

          {orcamentoEditandoId ? (
            <div className="space-y-2">
              <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Pencil size={11} /> Editando orçamento {formatId(orcamentoEditandoId)}</p>
              <div className="flex gap-2">
                <button onClick={resetar} disabled={salvando} className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-slate-300 font-black uppercase text-xs py-4 px-4 rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={() => finalizarVenda('orcamento')} disabled={salvando} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B1120] font-black uppercase text-xs py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                  {salvando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => finalizarVenda('orcamento')} disabled={salvando} className="flex-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 disabled:opacity-50 text-purple-400 font-black uppercase text-xs py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                <FileText size={16} /> Orçamento
              </button>
              <button onClick={() => finalizarVenda('pedido')} disabled={salvando} className="flex-1 bg-[var(--cor-primaria)] hover:bg-[#16A34A] disabled:opacity-50 text-[#0B1120] font-black uppercase text-xs py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                {salvando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                {salvando ? 'Salvando...' : 'Fechar venda'}
              </button>
            </div>
          )}
        </div>
      </div>

      {produtoDetalhe && (() => {
        const configuravel = criandoPersonalizado || ehSobEncomenda(produtoDetalhe);
        const totalExtras = extrasConfigurando.reduce((s, e) => s + e.valor, 0);
        const fecharModal = () => { setProdutoDetalhe(null); setEditandoServicoId(null); setExtrasConfigurando([]); setCriandoPersonalizado(false); };
        const invalido = criandoPersonalizado && (!produtoDetalhe.nome.trim() || !(produtoDetalhe.preco > 0));
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={fecharModal}>
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              {!criandoPersonalizado && (
                <div className="h-48 bg-white/5 flex items-center justify-center overflow-hidden relative shrink-0">
                  {produtoDetalhe.imagem_url ? <img src={produtoDetalhe.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={48} className="text-slate-600" />}
                  <button onClick={fecharModal} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white"><X size={16} /></button>
                </div>
              )}
              <div className="p-5">
                {criandoPersonalizado ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Settings2 size={12} /> Produto personalizado</p>
                      <button onClick={fecharModal} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
                    </div>
                    <input
                      value={produtoDetalhe.nome} onChange={e => setProdutoDetalhe(prev => prev && { ...prev, nome: e.target.value })}
                      placeholder="Nome do projeto (ex: Trailer sob medida - Família Silva)"
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white font-bold text-sm outline-none focus:border-[var(--cor-primaria)]"
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Valor base (R$)</label>
                        <input type="number" step="0.01" value={produtoDetalhe.preco || ''} onChange={e => setProdutoDetalhe(prev => prev && { ...prev, preco: Number(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-[var(--cor-primaria)]" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Prazo (dias, opcional)</label>
                        <input type="number" min="0" value={produtoDetalhe.prazo_fabricacao_dias ?? ''} onChange={e => setProdutoDetalhe(prev => prev && { ...prev, prazo_fabricacao_dias: e.target.value ? Number(e.target.value) : null })} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-[var(--cor-primaria)]" />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Descrição / especificações (aparece na venda e no orçamento)</label>
                      <textarea
                        value={produtoDetalhe.descricao ?? ''} onChange={e => setProdutoDetalhe(prev => prev && { ...prev, descricao: e.target.value })}
                        rows={5} placeholder="Ex: dimensões, itens inclusos, acabamento..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-[var(--cor-primaria)] resize-y"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-white font-black text-lg uppercase italic">{produtoDetalhe.nome}</h3>
                    <p className="text-[var(--cor-primaria)] font-black text-xl mt-1">R$ {produtoDetalhe.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    {produtoDetalhe.prazo_fabricacao_dias && (
                      <p className="inline-flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg mt-2">
                        <Factory size={11} /> Prazo de fabricação: ~{produtoDetalhe.prazo_fabricacao_dias} dias
                      </p>
                    )}
                    <div className="mt-4">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Descrição / especificações (só nesta venda — não altera o cadastro do produto)</label>
                      <textarea
                        value={produtoDetalhe.descricao ?? ''} onChange={e => setProdutoDetalhe(prev => prev && { ...prev, descricao: e.target.value })}
                        rows={5} placeholder="Dimensões, itens inclusos, acabamento..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-slate-300 text-sm outline-none focus:border-[var(--cor-primaria)] resize-y whitespace-pre-line"
                      />
                    </div>
                  </>
                )}

                {configuravel && (
                  <div className="border-t border-white/5 mt-4 pt-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2"><Settings2 size={12} /> Configuração / itens adicionais</p>
                    {extrasConfigurando.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {extrasConfigurando.map(ex => (
                          <div key={ex.chave} className="flex items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-300 text-xs">{ex.descricao}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-bold ${ex.valor >= 0 ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>{ex.valor >= 0 ? '+' : ''}R$ {ex.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              <button onClick={() => removerExtraConfiguracao(ex.chave)} className="text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input value={novoExtraDescricao} onChange={e => setNovoExtraDescricao(e.target.value)} placeholder="Ex: Teto elétrico, cor personalizada..." className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--cor-primaria)]" />
                      <input type="number" step="0.01" value={novoExtraValor} onChange={e => setNovoExtraValor(e.target.value)} placeholder="R$ (+/-)" className="w-24 shrink-0 bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--cor-primaria)]" />
                      <button onClick={adicionarExtraConfiguracao} disabled={!novoExtraDescricao.trim() || !Number(novoExtraValor)} className="shrink-0 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white p-2 rounded-lg"><Plus size={14} /></button>
                    </div>
                    <p className="text-slate-600 text-[9px] font-bold mt-1.5">Valor negativo desconta do projeto (ex: -500 pra tirar um item de série); positivo acrescenta.</p>
                    {totalExtras !== 0 && (
                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/5 text-xs">
                        <span className="text-slate-400 font-bold">Total do item (com configuração)</span>
                        <span className="text-white font-black">R$ {(produtoDetalhe.preco + totalExtras).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={confirmarConfiguracao}
                  disabled={invalido || (produtoDetalhe.estoque !== null && produtoDetalhe.estoque !== undefined && produtoDetalhe.estoque <= 0)}
                  className="w-full mt-5 bg-[var(--cor-primaria)] hover:bg-[#16A34A] disabled:opacity-40 text-[#0B1120] font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <Plus size={14} /> {editandoServicoId != null ? 'Salvar alterações' : 'Adicionar ao pedido'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {renderModalContrato()}
      {renderModalCobranca()}
    </div>
  );
}

export default function PulseNovaVendaPage() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>}>
      <PulseNovaVendaContent />
    </Suspense>
  );
}
