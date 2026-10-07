"use client";
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Plus, Minus, Trash2, X, Loader2, CheckCircle2, Printer, ShoppingBag, Package, AlertTriangle, Activity, FileText, Factory, History, ChevronDown, ChevronUp, Info, Pencil, Settings2, UserPlus, PenTool, Zap, Copy, FileCheck, BadgeCheck, Globe, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { planoPagamento } from '@/lib/planoPagamento';
import { diaReferenciaLead } from '@/lib/dataFechamento';
import NotasDaVenda, { COLUNAS_NOTA_VENDA, type NotaVenda } from '@/components/NotasDaVenda';
import { STATUS_NF_FALHA } from '@/lib/fiscalMotivo';
import { ClienteOpcao, ServicoConfig, ItemCarrinho, ConfiguracaoItem, FichaTecnicaItem, FORMAS_PAGAMENTO, formatId, imprimirReciboOuOrcamento, alertarEstoqueBaixoSeCruzou, registrarProducaoAutomatica, ehMateriaPrima, ehUsoConsumo, getLocalYYYYMMDD } from '../shared';
import CampoMoeda from '@/components/CampoMoeda';

const novaChaveExtra = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

function PulseNovaVendaContent() {
  const { authLoading, perfil, user, unidades, isLideranca, usersMap, temPulse, empresa, vendaDiretaPulse } = usePulseAccess();
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
  // Entrada + parcelas do saldo — editáveis já na tela principal (não só dentro de "Gerar
  // contrato"), pra dar pra ajustar o esquema de pagamento inteiro sem precisar abrir outra
  // tela. "Gerar contrato" continua existindo e usa/edita os mesmos campos da venda.
  const [valorEntrada, setValorEntrada] = useState('');
  const [formaPagamentoEntrada, setFormaPagamentoEntrada] = useState('');
  const [parcelasSaldo, setParcelasSaldo] = useState('1');
  const [vencimentoSaldo, setVencimentoSaldo] = useState('');
  // Carnê — cada parcela com data/valor próprios (ex: entrada + 5 iguais + 1 final maior).
  // Editado aqui, na tela principal, junto com o resto do pagamento — "Gerar contrato" só lê.
  const [parcelasDetalhe, setParcelasDetalhe] = useState<{ data: string; valor: number }[]>([]);
  // Não-nulo = reabriu um orçamento salvo pra editar; "salvar" vira update dessa linha em
  // vez de criar venda nova (ver finalizarVenda).
  const [orcamentoEditandoId, setOrcamentoEditandoId] = useState<number | null>(null);
  // Rótulo do que está sendo editado — mesma tela/fluxo serve pra orçamento e pra venda já
  // fechada (edição aqui só atualiza cliente/itens/pagamento; nunca refaz baixa de estoque,
  // produção ou financeiro, isso só acontece na criação de um pedido novo).
  const [editandoLabel, setEditandoLabel] = useState<'orçamento' | 'venda'>('orçamento');

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
  // Entrada/forma de pagamento/parcelas/carnê são todos editados na tela principal da venda
  // (valorEntrada, formaPagamentoEntrada, parcelasSaldo, vencimentoSaldo, parcelasDetalhe,
  // lá em cima) — este modal só lê de vendaAlvo, não edita nenhum desses campos.
  const [enviandoContrato, setEnviandoContrato] = useState(false);
  const [contratoErro, setContratoErro] = useState<string | null>(null);
  const [contratoLinks, setContratoLinks] = useState<{ consultorSignUrl: string; signUrl: string | null } | null>(null);

  // NF1 (entrega futura, CFOP 5922) — emitida na hora da venda. A NF2 (entrega, CFOP
  // 5116/6116) fica pro momento real da entrega, disparada em /pulse/producao.
  const [emitindoNf, setEmitindoNf] = useState(false);
  const [nfErro, setNfErro] = useState<string | null>(null);
  const [nfEmitida, setNfEmitida] = useState(false);

  // Detalhes da venda — clicar numa linha do histórico abre um resumo completo (cliente,
  // itens, pagamento, contrato assinado, cobranças) sem precisar entrar no modo de edição.
  const [detalheVenda, setDetalheVenda] = useState<any>(null);
  // NF-e da venda aberta no detalhe (pra ver status/motivo e mandar a nota pro cliente).
  const [notasDetalhe, setNotasDetalhe] = useState<NotaVenda[]>([]);
  const carregarNotasDetalhe = async (leadId: number) => {
    const { data } = await supabase.from('fiscal_notas').select(COLUNAS_NOTA_VENDA)
      .eq('tipo', 'saida').eq('lead_id', leadId).order('created_at', { ascending: true });
    setNotasDetalhe((data || []) as NotaVenda[]);
  };
  useEffect(() => {
    if (detalheVenda?.id) carregarNotasDetalhe(detalheVenda.id); else setNotasDetalhe([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalheVenda?.id]);
  // Portal do Cliente (Admin → Módulos → portal_cliente): aviso do envio automático ao fechar
  // a venda, e ações manuais no detalhe da venda (reenviar acesso, marcar parcela paga).
  const portalClienteAtivo = Boolean(empresa?.modulos?.portal_cliente);
  const [avisoPortal, setAvisoPortal] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviandoPortal, setEnviandoPortal] = useState(false);
  const [salvandoParcela, setSalvandoParcela] = useState<string | null>(null);

  const convidarPortal = async (leadId: number, reenviar = false) => {
    if (!portalClienteAtivo) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const res = await fetch('/api/portal-cliente/convidar', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ leadId, reenviar }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, texto: j.erro || 'Não foi possível enviar o acesso ao portal.' };
      if (j.enviado) return { ok: true, texto: `Acesso ao Portal do Cliente enviado para ${j.email}.` };
      return { ok: false, texto: j.motivo || 'Acesso ao portal não enviado.' };
    } catch {
      return { ok: false, texto: 'Não foi possível enviar o acesso ao portal.' };
    }
  };

  const enviarAcessoPortalManual = async (v: any) => {
    setEnviandoPortal(true);
    const r = await convidarPortal(v.id, true);
    setEnviandoPortal(false);
    if (r) {
      alert(r.texto);
      if (r.ok) setDetalheVenda((prev: any) => prev && prev.id === v.id ? { ...prev, portal_convite_enviado_em: new Date().toISOString() } : prev);
    }
  };

  // Venda sem boleto Asaas: equipe marca no portal quais parcelas do plano já foram pagas.
  const alternarParcelaPaga = async (v: any, chave: string, pagar: boolean) => {
    setSalvandoParcela(chave);
    const atual = v.parcelas_pagas && typeof v.parcelas_pagas === 'object' ? { ...v.parcelas_pagas } : {};
    if (pagar) atual[chave] = getLocalYYYYMMDD(new Date()); else delete atual[chave];
    const { error } = await supabase.from('leads').update({ parcelas_pagas: atual }).eq('id', v.id);
    setSalvandoParcela(null);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    setDetalheVenda((prev: any) => prev && prev.id === v.id ? { ...prev, parcelas_pagas: atual } : prev);
    setHistorico((prev: any[]) => prev.map(h => h.id === v.id ? { ...h, parcelas_pagas: atual } : h));
  };

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

  // ── Histórico: período + filtros (antes eram só as 30 últimas, sem filtro) ──────────────
  // Venda/estorno contam no dia em que foram FECHADOS (fechado_em); orçamento, no dia em que
  // foi criado — mesma regra do resto do sistema (lib/dataFechamento).
  type PeriodoHist = 'mes' | 'mes_ant' | '90d' | 'ano' | 'tudo' | 'custom';
  type TipoHist = 'todos' | 'vendas' | 'orcamentos' | 'estornadas' | 'contrato_pendente';
  const [periodoHist, setPeriodoHist] = useState<PeriodoHist>('mes');
  const [dataIniHist, setDataIniHist] = useState(() => getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [dataFimHist, setDataFimHist] = useState(() => getLocalYYYYMMDD(new Date()));
  const [tipoHist, setTipoHist] = useState<TipoHist>('todos');
  const [vendedorHist, setVendedorHist] = useState('todos');
  const [ordemHist, setOrdemHist] = useState<'recentes' | 'valor'>('recentes');
  const LIMITE_HIST = 300;

  const intervaloHist = (): { ini: string; fim: string } | null => {
    const h = new Date();
    const d = (dt: Date) => getLocalYYYYMMDD(dt);
    if (periodoHist === 'mes') return { ini: d(new Date(h.getFullYear(), h.getMonth(), 1)), fim: d(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
    if (periodoHist === 'mes_ant') return { ini: d(new Date(h.getFullYear(), h.getMonth() - 1, 1)), fim: d(new Date(h.getFullYear(), h.getMonth(), 0)) };
    if (periodoHist === '90d') { const i = new Date(h); i.setDate(i.getDate() - 89); return { ini: d(i), fim: d(h) }; }
    if (periodoHist === 'ano') return { ini: d(new Date(h.getFullYear(), 0, 1)), fim: d(new Date(h.getFullYear(), 11, 31)) };
    if (periodoHist === 'custom') return dataIniHist && dataFimHist ? { ini: dataIniHist, fim: dataFimHist } : null;
    return null;
  };

  const carregarHistorico = async () => {
    if (!perfil?.empresa_id) return;
    setCarregandoHistorico(true);
    // '*' de propósito (não lista de colunas) — evita quebrar essa tela toda vez que um campo
    // novo (ex: valor_entrada) é adicionado no leads antes da migration rodar em produção
    const base = () => supabase.from('leads').select('*').eq('empresa_id', perfil.empresa_id).eq('tipo', 'Pulse');
    const termo = buscaHistorico.trim();
    let consultas;
    if (termo.length >= 2) {
      // Busca procura em TODO o histórico (não só no período) — nome do cliente ou protocolo.
      const num = Number(termo.replace(/\D/g, ''));
      consultas = [base().ilike('empresa', `%${termo.replace(/[%_\\]/g, '')}%`).order('created_at', { ascending: false }).limit(100)];
      if (num > 0) consultas.push(base().eq('id', num).limit(1));
    } else {
      const iv = intervaloHist();
      if (!iv) {
        consultas = [base().order('created_at', { ascending: false }).limit(LIMITE_HIST)];
      } else {
        const ini = new Date(iv.ini + 'T00:00:00').toISOString();
        const fim = new Date(iv.fim + 'T23:59:59.999').toISOString();
        consultas = [
          base().gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false }).limit(LIMITE_HIST),
          base().gte('fechado_em', ini).lte('fechado_em', fim).order('fechado_em', { ascending: false }).limit(LIMITE_HIST),
        ];
      }
    }
    const resultados = await Promise.all(consultas);
    const porId = new Map<number, (typeof historico)[number]>();
    resultados.forEach(r => (r.data || []).forEach(l => porId.set(l.id, l)));
    setHistorico(Array.from(porId.values()));
    setCarregandoHistorico(false);
  };

  // Recarrega ao trocar período ou busca (busca com pequena espera pra não consultar a cada tecla).
  useEffect(() => {
    if (!mostrarHistorico) return;
    const t = setTimeout(() => carregarHistorico(), buscaHistorico.trim() ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarHistorico, periodoHist, dataIniHist, dataFimHist, buscaHistorico, perfil?.empresa_id]);

  const toggleHistorico = () => setMostrarHistorico(v => !v);

  // Estorno marca status 'perdido' (+ estornado_em); qualquer 'perdido' sai do faturamento.
  const ehEstornada = (h: { status?: string }) => h.status === 'perdido';
  const contratoPendente = (h: { status?: string; docuseal_assinado?: boolean; contrato_manual_url?: string | null; contrato_manual_arquivos?: unknown }) => h.status === 'ganho' && !h.docuseal_assinado && !h.contrato_manual_url
    && !(Array.isArray(h.contrato_manual_arquivos) && h.contrato_manual_arquivos.length > 0);

  // 1) recorte do período pela data certa de cada registro (a busca ignora o período)
  const historicoNoPeriodo = (() => {
    const iv = buscaHistorico.trim().length >= 2 ? null : intervaloHist();
    return historico.filter(h => {
      if (vendedorHist !== 'todos' && h.user_id !== vendedorHist) return false;
      if (!iv) return true;
      const dia = h.status === 'orcamento' ? getLocalYYYYMMDD(new Date(h.created_at)) : diaReferenciaLead(h);
      return dia >= iv.ini && dia <= iv.fim;
    });
  })();
  const contagemHist = {
    todos: historicoNoPeriodo.length,
    vendas: historicoNoPeriodo.filter(h => h.status === 'ganho').length,
    orcamentos: historicoNoPeriodo.filter(h => h.status === 'orcamento').length,
    estornadas: historicoNoPeriodo.filter(ehEstornada).length,
    contrato_pendente: historicoNoPeriodo.filter(contratoPendente).length,
  };
  // 2) tipo + ordenação
  const historicoFiltrado = historicoNoPeriodo
    .filter(h => tipoHist === 'todos' ? true
      : tipoHist === 'vendas' ? h.status === 'ganho'
      : tipoHist === 'orcamentos' ? h.status === 'orcamento'
      : tipoHist === 'estornadas' ? ehEstornada(h)
      : contratoPendente(h))
    .sort((a, b) => ordemHist === 'valor'
      ? Number(b.valor_total || 0) - Number(a.valor_total || 0)
      : (b.status === 'orcamento' ? b.created_at : diaReferenciaLead(b)).localeCompare(a.status === 'orcamento' ? a.created_at : diaReferenciaLead(a)) || b.id - a.id);
  // Faturado = só vendas ganhas (antes somava também as estornadas).
  const vendasPeriodo = historicoNoPeriodo.filter(h => h.status === 'ganho');
  const totalHistoricoFiltrado = vendasPeriodo.reduce((s, h) => s + Number(h.valor_total || 0), 0);
  const orcamentosPeriodo = historicoNoPeriodo.filter(h => h.status === 'orcamento');
  const valorOrcamentosPeriodo = orcamentosPeriodo.reduce((s, h) => s + Number(h.valor_total || 0), 0);

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
  const ehSobEncomenda = (s: ServicoConfig) => !ehMateriaPrima(s) && !ehUsoConsumo(s) && (s.estoque === null || s.estoque === undefined);

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
  const servicosVenda = servicos.filter(s => !ehMateriaPrima(s) && !ehUsoConsumo(s) && (!s.unidade || s.unidade === unidadeSel));
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
    setValorEntrada(''); setFormaPagamentoEntrada(''); setParcelasSaldo('1'); setVencimentoSaldo(''); setParcelasDetalhe([]);
    setProducoesIniciadas([]); setOrcamentoEditandoId(null); setAvisoPortal(null);
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
    setEditandoLabel(h.status === 'orcamento' ? 'orçamento' : 'venda');
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
    setValorEntrada(h.valor_entrada ? String(h.valor_entrada) : '');
    setFormaPagamentoEntrada(h.forma_pagamento_entrada || '');
    setParcelasSaldo(h.parcelas || '1');
    setVencimentoSaldo(h.vencimento || '');
    setParcelasDetalhe(Array.isArray(h.parcelas_detalhe) ? h.parcelas_detalhe : []);
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
    supabase.from('leads').select('*')
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
      // Converter orçamento em venda (modo 'pedido' editando um orçamento) passa pelo MESMO
      // caminho de "Fechar venda" logo abaixo — lançamento, visita, baixa de estoque e
      // produção automática. O antigo "Converter em Pedido" do Painel fazia só parte disso
      // (não iniciava a produção do trailer, lançamento sem lead_id).
      const convertendoOrcamento = Boolean(orcamentoEditandoId) && modo === 'pedido' && editandoLabel === 'orçamento';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let leadData: any = null;
      let vendedorDaVenda = vendedorId || user?.id;

      if (orcamentoEditandoId) {
        let upd = supabase.from('leads').update({
          empresa: nomeCliente, telefone: clienteSelecionado.telefone || null, cnpj: clienteSelecionado.cnpj || null,
          valor_total: total, desconto, itens: itensPayload,
          unidade: unidadeSel || null, forma_pagamento: formaPagamento, client_id: clientId,
          parcelas: parcelasSaldo || '1', vencimento: vencimentoSaldo || null,
          valor_entrada: valorEntrada ? Number(valorEntrada) : null,
          forma_pagamento_entrada: formaPagamentoEntrada || null,
          parcelas_detalhe: parcelasDetalhe.length > 0 ? parcelasDetalhe : null,
          ...(convertendoOrcamento ? { status: 'ganho', etapa: 4 } : {}),
        }).eq('id', orcamentoEditandoId);
        // Trava contra converter duas vezes (duplo clique / outra aba): só converte se
        // ainda estiver como orçamento.
        if (convertendoOrcamento) upd = upd.eq('status', 'orcamento');
        const { data: leadAtualizado, error: erroUpdate } = await upd.select().maybeSingle();
        if (erroUpdate) throw erroUpdate;
        if (!leadAtualizado) throw new Error('Esse orçamento já foi convertido em venda ou não existe mais.');

        if (!convertendoOrcamento) {
          setVendaConcluida({ ...leadAtualizado, empresa: nomeCliente, itens: itensPayload });
          setOrcamentoEditandoId(null);
          if (mostrarHistorico) carregarHistorico();
          setSalvando(false);
          return;
        }
        // Crédito da venda fica com o dono do orçamento (mesma regra do Painel).
        vendedorDaVenda = leadAtualizado.user_id || vendedorDaVenda;
        await supabase.from('leads').update({ fechado_por: vendedorDaVenda || null }).eq('id', leadAtualizado.id);
        leadData = leadAtualizado;
      }

      if (!leadData) {
      const { data: novoLead, error: erroLead } = await supabase.from('leads').insert([{
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
        parcelas: parcelasSaldo || '1',
        vencimento: vencimentoSaldo || null,
        valor_entrada: valorEntrada ? Number(valorEntrada) : null,
        forma_pagamento_entrada: formaPagamentoEntrada || null,
        parcelas_detalhe: parcelasDetalhe.length > 0 ? parcelasDetalhe : null,
        client_id: clientId,
        empresa_id: perfil?.empresa_id,
        user_id: vendedorId || user?.id,
        criado_por: user?.id,
        ordem: 0,
      }]).select().single();
      if (erroLead) throw erroLead;
      leadData = novoLead;
      }

      // Item reaberto de orçamento volta "avulso" (sem servicoId do catálogo) — religa pelo
      // nome pra baixar estoque e iniciar a produção. Nome salvo pode ter os extras de
      // configuração no fim: "Trailer X (Ar-condicionado, TV)".
      const servicoDoItem = (i: ItemCarrinho) => {
        if (i.servicoId > 0) return servicos.find(x => x.id === i.servicoId);
        return servicos.find(x => x.nome === i.nome)
          || [...servicos].sort((a, b) => b.nome.length - a.nome.length).find(x => i.nome.startsWith(x.nome + ' ('));
      };
      const itensResolvidos = carrinho.map(i => ({ i, s: servicoDoItem(i) }));

      if (modo === 'pedido') {
        await Promise.all([
          supabase.from('lancamentos').insert([{
            titulo: `VENDA RÁPIDA: ${nomeCliente} (${unidadeSel || 'Geral'}) - OS: ${formatId(leadData.id)}`,
            valor: total, tipo: 'entrada', categoria: 'vendas', status: 'pendente',
            data_vencimento: new Date().toISOString().split('T')[0],
            user_id: user?.id, empresa_id: perfil?.empresa_id, lead_id: leadData.id,
          }]),
          // Venda fechada direto no Pulse não passa pelo check-in manual de /visitas — sem isso,
          // ranking e relatórios de visita zeravam pra quem vende só por aqui.
          supabase.from('visitas').insert([{
            empresa: nomeCliente, telefone: clienteSelecionado.telefone || null,
            observacao: `Venda Pulse — OS ${formatId(leadData.id)}`,
            user_id: vendedorDaVenda, empresa_id: perfil?.empresa_id, unidade: unidadeSel || null,
            lead_id: leadData.id,
          }]),
          ...itensResolvidos.flatMap(({ i, s: sv }) => {
            const estoqueAtual = i.estoqueMax !== null ? i.estoqueMax : (sv?.estoque ?? null);
            if (estoqueAtual === null || !sv) return [];
            const novo = Math.max(0, estoqueAtual - i.quantidade);
            const deltaReal = novo - estoqueAtual;
            const minimo = sv.estoque_minimo ?? 5;
            alertarEstoqueBaixoSeCruzou(sv.id, estoqueAtual, novo, minimo);
            return [
              supabase.from('servicos').update({ estoque: novo }).eq('id', sv.id),
              supabase.from('estoque_movimentacoes').insert([{
                empresa_id: perfil?.empresa_id, servico_id: sv.id, quantidade: deltaReal,
                tipo: 'venda', lead_id: leadData.id, observacao: `Venda Pulse — OS ${formatId(leadData.id)}`, user_id: user?.id,
              }]),
            ];
          }),
        ]);
        setServicos(prev => prev.map(s => {
          const item = itensResolvidos.find(r => r.s?.id === s.id)?.i;
          return item && s.estoque !== null && s.estoque !== undefined ? { ...s, estoque: Math.max(0, s.estoque - item.quantidade) } : s;
        }));

        // Produto sob encomenda com ficha técnica: produção nasce sozinha, direto em
        // "Em produção" — ninguém passa pelo form manual de novo. Mapa com cópias (não as
        // referências de `servicos`) porque duas produções desta MESMA venda podem
        // compartilhar matéria-prima — sem atualizar o estoque local entre elas, a segunda
        // chamada partiria do estoque de antes da primeira e sobrescreveria o desconto dela.
        const servicoPorId = new Map(servicos.map(s => [s.id, { ...s }]));
        const itensSobEncomenda = itensResolvidos.filter(({ s: sv }) => {
          const prod = sv ? servicoPorId.get(sv.id) : undefined;
          return prod && ehSobEncomenda(prod);
        });
        const resultados: { nome: string; ok: boolean }[] = [];
        for (const { i: item, s: sv } of itensSobEncomenda) {
          const produtoFinal = servicoPorId.get(sv!.id)!;
          // Sem ficha técnica cadastrada, fichaItens fica vazio — a produção nasce igual,
          // só não consome matéria-prima nenhuma automaticamente (registrarProducaoAutomatica
          // já lida bem com lista vazia).
          const fichaItens = fichasPorProduto.get(sv!.id) || [];
          try {
            await registrarProducaoAutomatica({
              empresaId: perfil?.empresa_id, produtoFinal, quantidadeProduzida: item.quantidade,
              fichaItens, materiaPrimaPorId: servicoPorId,
              userId: user?.id, responsavelId: vendedorDaVenda, leadId: leadData.id, status: 'em_producao',
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
      if (convertendoOrcamento) setOrcamentoEditandoId(null);
      // Venda fechada → cliente recebe o acesso ao Portal do Cliente por e-mail (se o módulo
      // estiver ligado). Não trava a tela: o aviso aparece quando o envio terminar.
      setAvisoPortal(null);
      if (modo === 'pedido' && portalClienteAtivo) convidarPortal(leadData.id).then(r => { if (r) setAvisoPortal(r); });
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
  const abrirContrato = async (venda: any = vendaConcluida) => {
    setVendaAlvo(venda);
    // Sincroniza o pagamento com o que está salvo NESSA venda — importante quando "Gerar
    // contrato" é aberto direto pelo ícone do histórico (sem passar por "Editar" antes),
    // pra não mostrar entrada/parcelas/carnê deixados na tela por outra venda editada antes.
    setValorEntrada(venda?.valor_entrada ? String(venda.valor_entrada) : '');
    setFormaPagamentoEntrada(venda?.forma_pagamento_entrada || '');
    setParcelasSaldo(venda?.parcelas || '1');
    setVencimentoSaldo(venda?.vencimento || '');
    setParcelasDetalhe(Array.isArray(venda?.parcelas_detalhe) ? venda.parcelas_detalhe : []);
    // Cliente completo (email/telefone/endereço) só existe no cadastro, não na venda — se
    // "Gerar contrato" é aberto direto pelo histórico (sem passar por "Editar" antes),
    // clienteSelecionado podia estar vazio ou ser de outra venda, e o e-mail/telefone/endereço
    // saíam em branco mesmo o cliente já estando cadastrado. Busca de novo sempre que não
    // bater com o client_id desta venda, e usa o resultado direto (não o state, que só
    // atualiza no próximo render) pra preencher e-mail/telefone já nesta mesma chamada.
    let cliente = clienteSelecionado;
    if (venda?.client_id && clienteSelecionado?.id !== venda.client_id) {
      const { data } = await supabase.from('clientes').select('*').eq('id', venda.client_id).single();
      if (data) { cliente = data as ClienteOpcao; setClienteSelecionado(cliente); }
    }
    setContratoEmail(cliente?.email || '');
    setContratoTelefone(cliente?.telefone || venda?.telefone || '');
    setContratoErro(null);
    setContratoLinks(null);
    setContratoAberto(true);
  };

  const enviarContrato = async () => {
    if (!contratoEmail.trim()) { setContratoErro('Informe o e-mail do cliente — o Docuseal manda o link de assinatura por lá.'); return; }
    if (!vendaAlvo) return;
    setEnviandoContrato(true); setContratoErro(null);
    try {
      // Endereço completo do cliente (rua + número + bairro + CEP + cidade/UF) — só existe
      // no cadastro (clienteSelecionado), a venda em si nunca guardou isso. Sem número/bairro/
      // CEP o contrato saía só com o nome da rua, incompleto mesmo com o cadastro certo.
      const enderecoCompleto = [
        clienteSelecionado?.endereco,
        clienteSelecionado?.numero ? `nº ${clienteSelecionado.numero}` : null,
        clienteSelecionado?.bairro ? `Bairro ${clienteSelecionado.bairro}` : null,
        clienteSelecionado?.cep ? `CEP ${clienteSelecionado.cep}` : null,
        clienteSelecionado?.cidade ? `${clienteSelecionado.cidade}${clienteSelecionado?.estado ? '/' + clienteSelecionado.estado : ''}` : null,
      ].filter(Boolean).join(', ');
      // Prazo de fabricação: mesmo problema do e-mail/telefone/endereço — prazoEstimado é
      // calculado em cima do CARRINHO ATUAL da tela, não dos itens de fato salvos nessa
      // venda. Abrindo "Gerar contrato" direto pelo histórico (sem passar por "Editar"
      // antes), o carrinho podia estar vazio ou ser de outra venda, e a cláusula de prazo
      // saía errada ou sem prazo nenhum. Recalcula aqui a partir de vendaAlvo.itens (o maior
      // prazo entre os itens da venda, casando pelo nome com o catálogo — itens salvos não
      // guardam o id do serviço, só o nome/preço/qtd como snapshot).
      const itensVenda = Array.isArray(vendaAlvo.itens) ? vendaAlvo.itens : [];
      const prazosVenda = itensVenda
        .map((it: any) => servicos.find(s => s.nome === it.servico)?.prazo_fabricacao_dias)
        .filter((d: any): d is number => typeof d === 'number' && d > 0);
      const prazoFabricacaoDiasVenda = prazosVenda.length > 0 ? Math.max(...prazosVenda) : null;
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
            endereco: enderecoCompleto || undefined, cidade: clienteSelecionado?.cidade,
            itens: vendaAlvo.itens, desconto: vendaAlvo.desconto || 0, valor_total: vendaAlvo.valor_total,
            parcelas: vendaAlvo.parcelas || '1', vencimento: vendaAlvo.vencimento || undefined,
            forma_pagamento: vendaAlvo.forma_pagamento || undefined,
            valor_entrada: Number(vendaAlvo.valor_entrada) > 0 ? Number(vendaAlvo.valor_entrada) : undefined,
            forma_pagamento_entrada: vendaAlvo.forma_pagamento_entrada || undefined,
            parcelas_detalhe: Array.isArray(vendaAlvo.parcelas_detalhe) && vendaAlvo.parcelas_detalhe.length > 0 ? vendaAlvo.parcelas_detalhe : undefined,
            prazoFabricacaoDias: prazoFabricacaoDiasVenda, unidade: vendaAlvo.unidade || unidadeSel,
          },
          signers: [{ name: vendaAlvo.empresa, email: contratoEmail.trim(), phone: contratoTelefone }],
          consultor: { nome: perfil?.nome || 'Vendedor', email: user?.email },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao gerar contrato.');
      setContratoLinks({ consultorSignUrl: json.consultor_sign_url, signUrl: json.sign_url });
      if (mostrarHistorico) carregarHistorico();
    } catch (err: any) {
      setContratoErro(err?.message || 'Erro ao gerar contrato.');
    } finally {
      setEnviandoContrato(false);
    }
  };

  // Bucket "contratos-assinados" é privado — gera um link assinado (temporário) na hora do
  // clique, mesmo padrão já usado no CRM (deals/page.tsx: abrirArquivoAssinado).
  const abrirArquivoAssinado = async (path: string) => {
    const { data, error } = await supabase.storage.from('contratos-assinados').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else console.error('[abrirArquivoAssinado]', error);
  };

  const [cancelandoContrato, setCancelandoContrato] = useState(false);
  // Cancela o contrato ativo (arquiva a submissão no Docuseal e limpa os campos docuseal_*
  // da venda) sem precisar gerar um novo em seguida — útil pra tirar do ar um link de
  // assinatura de um contrato que saiu com dado errado.
  const cancelarContrato = async (venda: any) => {
    if (!venda?.id) return;
    if (!confirm('Cancelar este contrato? O link de assinatura atual para de funcionar. Isso não apaga um contrato já assinado, só invalida a submissão ativa.')) return;
    setCancelandoContrato(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/docuseal/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ lead_id: venda.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao cancelar contrato.');
      const limpo = { docuseal_submission_id: null, docuseal_sign_url: null, docuseal_consultor_sign_url: null, docuseal_consultor_assinado: false, docuseal_assinado: false };
      setHistorico(hs => hs.map(h => h.id === venda.id ? { ...h, ...limpo } : h));
      setDetalheVenda((v: any) => v && v.id === venda.id ? { ...v, ...limpo } : v);
    } catch (err: any) {
      alert(err?.message || 'Erro ao cancelar contrato.');
    } finally {
      setCancelandoContrato(false);
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

  // Mesma coisa que abrirCobranca, mas pré-preenchida com o valor/vencimento de UMA
  // parcela específica do carnê — usado no botão "Gerar boleto/Pix" de cada linha na tela
  // de detalhes da venda, pra não precisar digitar de novo um valor que já está definido ali.
  const abrirCobrancaParcela = (venda: any, parcela: { data: string; valor: number }) => {
    if (!venda) return;
    setVendaAlvo(venda);
    setCobrancaTipo('BOLETO');
    setCobrancaValor(String(parcela.valor || ''));
    setCobrancaVencimento(parcela.data || new Date().toISOString().split('T')[0]);
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

  // venda é opcional (default vendaAlvo) pra funcionar também na tela de detalhes da venda,
  // que não passa pelo modal de cobrança (onde vendaAlvo é sempre setado) antes de cancelar.
  const cancelarCobranca = async (asaasPaymentId: string, venda: any = vendaAlvo) => {
    if (!venda) return;
    if (!confirm('Cancelar esta cobrança? Essa ação não pode ser desfeita na Asaas.')) return;
    setCancelandoCobranca(asaasPaymentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/financeiro/cobranca', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ leadId: venda.id, asaasPaymentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao cancelar cobrança.');
      atualizarCobrancasLocal(venda.id, lista => lista.map((c: any) =>
        c.asaasPaymentId === asaasPaymentId ? { ...c, cancelada: true, canceladoEm: new Date().toISOString() } : c
      ));
    } catch (err: any) {
      alert(err?.message || 'Erro ao cancelar cobrança.');
    } finally {
      setCancelandoCobranca(null);
    }
  };

  // Consulta o status de verdade na Asaas e sincroniza — pro caso do webhook de confirmação
  // nunca ter chegado (empresa configurou a URL do webhook na Asaas depois de já ter gerado
  // cobrança, falha de rede pontual, etc.). Também é como se descobre que uma cobrança que a
  // Asaas recusou cancelar (por já estar paga) foi de fato paga, sem precisar abrir o painel
  // da Asaas por fora.
  const [verificandoCobranca, setVerificandoCobranca] = useState<string | null>(null);
  const verificarStatusCobranca = async (asaasPaymentId: string, venda: any = vendaAlvo) => {
    if (!venda) return;
    setVerificandoCobranca(asaasPaymentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/financeiro/cobranca', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ leadId: venda.id, asaasPaymentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao verificar status.');
      if (json.pago) {
        atualizarCobrancasLocal(venda.id, lista => lista.map((c: any) =>
          c.asaasPaymentId === asaasPaymentId ? { ...c, pago: true, dataPagamento: json.dataPagamento } : c
        ));
      } else {
        alert(`Status na Asaas: ${json.status}. Ainda não está pago.`);
      }
    } catch (err: any) {
      alert(err?.message || 'Erro ao verificar status.');
    } finally {
      setVerificandoCobranca(null);
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
  // Preenche o carnê com N parcelas de valor igual (mesma matemática de arredondamento do
  // gerador de boleto/Pix — última parcela absorve os centavos) a partir do saldo (total −
  // entrada) e das parcelas/vencimento já preenchidos ali em cima. Ponto de partida editável:
  // dá pra ajustar valor/data de cada linha depois (ex: deixar a última maior, tipo balão).
  const [erroParcelasDetalhe, setErroParcelasDetalhe] = useState<string | null>(null);
  const gerarParcelasIguais = () => {
    setErroParcelasDetalhe(null);
    const saldo = Math.max(0, total - (Number(valorEntrada) || 0));
    const qtd = Math.max(1, parseInt(parcelasSaldo || '1', 10) || 1);
    if (!vencimentoSaldo) { setErroParcelasDetalhe('Informe o 1º vencimento antes de gerar as parcelas.'); return; }
    const geradas = calcularParcelas(saldo, qtd, vencimentoSaldo);
    setParcelasDetalhe(geradas.map(p => ({ data: p.vencimento, valor: p.valor })));
  };
  const atualizarParcelaDetalhe = (idx: number, patch: Partial<{ data: string; valor: number }>) =>
    setParcelasDetalhe(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  const removerParcelaDetalhe = (idx: number) => setParcelasDetalhe(prev => prev.filter((_, i) => i !== idx));
  const adicionarParcelaDetalhe = () => setParcelasDetalhe(prev => [...prev, { data: '', valor: 0 }]);

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
            <div className="border-t border-white/5 pt-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Pagamento (editado na tela da venda)</p>
              {Number(vendaAlvo?.valor_entrada) > 0 && (
                <p className="text-slate-400 text-xs">Entrada: <span className="text-white font-bold">R$ {Number(vendaAlvo.valor_entrada).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>{vendaAlvo?.forma_pagamento_entrada ? ` — ${vendaAlvo.forma_pagamento_entrada}` : ''}</p>
              )}
              {Array.isArray(vendaAlvo?.parcelas_detalhe) && vendaAlvo.parcelas_detalhe.length > 0 ? (
                <p className="text-slate-400 text-xs">Carnê: <span className="text-white font-bold">{vendaAlvo.parcelas_detalhe.length} parcelas</span>, soma R$ {vendaAlvo.parcelas_detalhe.reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              ) : (
                <p className="text-slate-400 text-xs">{vendaAlvo?.parcelas || 1}x{vendaAlvo?.vencimento ? `, a partir de ${new Date(vendaAlvo.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''} — {vendaAlvo?.forma_pagamento || 'forma de pagamento não definida'}</p>
              )}
              <p className="text-slate-600 text-[9px] mt-1.5">Diferente do combinado? Feche este contrato, ajuste na tela da venda (Editar) e abra de novo.</p>
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
                  <p className="text-slate-500 text-[10px]">{c.pago ? `Pago em ${new Date(c.dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}` : `Vence ${c.vencimento ? new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}`}</p>
                </div>
                {c.cancelada ? (
                  <span className="flex-shrink-0 text-slate-500 text-[10px] font-black uppercase">Cancelada</span>
                ) : c.pago ? (
                  <span className="flex-shrink-0 text-emerald-400 text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={11} /> Pago</span>
                ) : (
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {(c.bankSlipUrl || c.invoiceUrl) && (
                      <a href={c.bankSlipUrl || c.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-[10px] font-black uppercase">Abrir ↗</a>
                    )}
                    <button
                      onClick={() => verificarStatusCobranca(c.asaasPaymentId)}
                      disabled={verificandoCobranca === c.asaasPaymentId}
                      title="Consultar status direto na Asaas"
                      className="text-slate-400 hover:text-white disabled:opacity-50 text-[10px] font-black uppercase"
                    >
                      {verificandoCobranca === c.asaasPaymentId ? '...' : 'Verificar'}
                    </button>
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
              <CampoMoeda value={Number(cobrancaValor) || 0} onChange={v => setCobrancaValor(v ? String(v) : '')} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-emerald-500" />
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

  const renderModalDetalheVenda = () => detalheVenda && (() => {
    const v = detalheVenda;
    const itens = Array.isArray(v.itens) ? v.itens : [];
    const arquivos = Array.isArray(v.docuseal_arquivos) ? v.docuseal_arquivos : [];
    const cobrancas = Array.isArray(v.cobrancas_manuais) ? [...v.cobrancas_manuais].reverse() : [];
    const temCarne = Array.isArray(v.parcelas_detalhe) && v.parcelas_detalhe.length > 0;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetalheVenda(null)}>
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl text-left max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0F172A] z-10">
            <div>
              <h3 className="font-black text-white uppercase italic text-lg">{formatId(v.id)} · {v.empresa}</h3>
              <p className="text-slate-500 text-xs">{new Date(v.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <button onClick={() => setDetalheVenda(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
          </div>

          <div className="p-6 space-y-5">
            {/* Cliente */}
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cliente</p>
              <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-1">
                <p className="text-white text-sm font-bold">{v.empresa}</p>
                {v.cnpj && <p className="text-slate-400 text-xs">CPF/CNPJ: {v.cnpj}</p>}
                {v.telefone && <p className="text-slate-400 text-xs">Tel: {v.telefone}</p>}
                {v.endereco && <p className="text-slate-400 text-xs">{v.endereco}{v.cidade ? ` · ${v.cidade}` : ''}</p>}
              </div>
            </div>

            {/* Itens */}
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Itens</p>
              <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-1.5">
                {itens.map((it: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{it.quantidade}x {it.servico}</span>
                    <span className="text-white font-bold">R$ {(it.quantidade * it.precoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="border-t border-white/10 pt-1.5 flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-black uppercase">Total</span>
                  <span className="text-white text-sm font-black">R$ {Number(v.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Pagamento */}
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Pagamento</p>
              <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-1 text-xs">
                {Number(v.valor_entrada) > 0 && (
                  <p className="text-slate-300">Entrada: <span className="text-white font-bold">R$ {Number(v.valor_entrada).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>{v.forma_pagamento_entrada ? ` — ${v.forma_pagamento_entrada}` : ''}</p>
                )}
                {temCarne ? (
                  <div className="space-y-1.5 pt-1">
                    {v.parcelas_detalhe.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <p className="text-slate-300">Parcela {i + 1}/{v.parcelas_detalhe.length} — {p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}: <span className="text-white font-bold">R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                        <button onClick={() => { setDetalheVenda(null); abrirCobrancaParcela(v, p); }} title="Gerar boleto/Pix dessa parcela" className="shrink-0 text-emerald-400 hover:text-emerald-300 text-[10px] font-black uppercase flex items-center gap-1"><Zap size={11} /> Boleto/Pix</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-300">{v.parcelas || 1}x{v.vencimento ? `, a partir de ${new Date(v.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}</p>
                )}
                {v.forma_pagamento && <p className="text-slate-300">Forma (saldo): <span className="text-white font-bold">{v.forma_pagamento}</span></p>}
              </div>
            </div>

            {/* Contrato */}
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Contrato</p>
              {v.docuseal_assinado ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <p className="text-emerald-400 text-xs font-black uppercase mb-1.5 flex items-center gap-1.5"><CheckCircle2 size={13} /> Assinado</p>
                  {arquivos.length > 0 ? (
                    <div className="flex flex-wrap gap-3 mb-2">
                      {arquivos.map((a: any, i: number) => (
                        <button key={i} onClick={() => abrirArquivoAssinado(a.path)} className="text-emerald-400 hover:text-emerald-300 text-xs font-bold underline">{a.nome}</button>
                      ))}
                    </div>
                  ) : <p className="text-slate-500 text-[10px] mb-2">Assinado, mas o arquivo ainda não foi arquivado.</p>}
                  <button onClick={() => cancelarContrato(v)} disabled={cancelandoContrato} className="text-red-400 hover:text-red-300 disabled:opacity-50 text-[10px] font-black uppercase">Cancelar contrato</button>
                </div>
              ) : v.docuseal_submission_id ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-2">
                  <p className="text-amber-400 text-xs font-black uppercase">Aguardando assinatura</p>
                  {(v.docuseal_consultor_sign_url || v.docuseal_sign_url) && (
                    <div className="space-y-1">
                      {v.docuseal_consultor_sign_url && (
                        <a href={v.docuseal_consultor_sign_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-[11px] font-bold underline"><PenTool size={11} /> Link de assinatura — vendedor</a>
                      )}
                      {v.docuseal_sign_url && (
                        <a href={v.docuseal_sign_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-[11px] font-bold underline"><PenTool size={11} /> Link de assinatura — cliente</a>
                      )}
                      <p className="text-slate-500 text-[9px]">O Docuseal só libera o link do cliente pra ele depois que o vendedor assinar primeiro.</p>
                    </div>
                  )}
                  <button onClick={() => cancelarContrato(v)} disabled={cancelandoContrato} className="text-red-400 hover:text-red-300 disabled:opacity-50 text-[10px] font-black uppercase">Cancelar contrato</button>
                </div>
              ) : (
                <p className="text-slate-500 text-xs">Nenhum contrato gerado ainda.</p>
              )}
            </div>

            {/* Nota fiscal (NF-e) */}
            {v.status === 'ganho' && (() => {
              const temValida = notasDetalhe.some(n => !STATUS_NF_FALHA.includes(n.status) && n.status !== 'cancelada' && !n.chave_nf_referenciada);
              return (
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nota fiscal</p>
                  {notasDetalhe.length > 0
                    ? <NotasDaVenda notas={notasDetalhe} telefone={v.telefone} cliente={v.empresa} protocolo={formatId(v.id)} />
                    : <p className="text-slate-500 text-xs">Nenhuma NF emitida ainda.</p>}
                  {!temValida && (
                    <button
                      onClick={async () => { await emitirNf1(v); setTimeout(() => carregarNotasDetalhe(v.id), 4000); }}
                      disabled={emitindoNf}
                      className="mt-2 w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 disabled:opacity-50 text-blue-300 text-[10px] font-black uppercase py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                    >
                      {emitindoNf ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                      {notasDetalhe.length > 0 ? 'Emitir NF de novo (entrega futura)' : 'Emitir NF (entrega futura)'}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Portal do Cliente */}
            {portalClienteAtivo && v.status === 'ganho' && (() => {
              const plano = planoPagamento(v);
              const manual = plano.length > 0 && plano[0].origem === 'contrato';
              return (
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Globe size={11} /> Portal do Cliente</p>
                  <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-300">
                        {v.portal_convite_enviado_em
                          ? <>Acesso enviado em <b className="text-white">{new Date(v.portal_convite_enviado_em).toLocaleDateString('pt-BR')}</b></>
                          : 'O cliente ainda não recebeu o acesso.'}
                      </p>
                      <button onClick={() => enviarAcessoPortalManual(v)} disabled={enviandoPortal} className="shrink-0 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 disabled:opacity-50 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                        {enviandoPortal ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} {v.portal_convite_enviado_em ? 'Reenviar acesso' : 'Enviar acesso'}
                      </button>
                    </div>
                    {manual && (
                      <div className="space-y-1.5 border-t border-white/5 pt-2.5">
                        <p className="text-[10px] text-slate-500">Marque o que o cliente já pagou — aparece pra ele no portal.</p>
                        {plano.map(x => (
                          <label key={x.chave} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox" checked={x.pago} disabled={salvandoParcela !== null} onChange={e => alternarParcelaPaga(v, x.chave, e.target.checked)} className="accent-emerald-500" />
                            <span className={x.pago ? 'text-emerald-400' : 'text-slate-300'}>{x.rotulo}{x.vencimento ? ` · ${new Date(x.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}</span>
                            <span className="ml-auto text-white font-bold">R$ {x.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            {salvandoParcela === x.chave && <Loader2 size={11} className="animate-spin text-slate-400" />}
                          </label>
                        ))}
                      </div>
                    )}
                    {!manual && plano.length > 0 && <p className="text-[10px] text-slate-500 border-t border-white/5 pt-2.5">Parcelas por boleto/Pix: o status de pago vai sozinho pro portal quando o Asaas confirmar.</p>}
                  </div>
                </div>
              );
            })()}

            {/* Cobranças */}
            {cobrancas.length > 0 && (
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Boletos/Pix gerados</p>
                <div className="space-y-1.5">
                  {cobrancas.map((c: any, i: number) => (
                    <div key={i} className="bg-black/30 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${c.cancelada ? 'text-slate-500 line-through' : 'text-white'}`}>{c.tipo}{c.parcela ? ` · parcela ${c.parcela}` : ''} · R$ {Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-slate-500 text-[10px]">{c.pago ? `Pago em ${new Date(c.dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}` : `Vence ${c.vencimento ? new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}`}</p>
                      </div>
                      {c.cancelada ? (
                        <span className="flex-shrink-0 text-slate-500 text-[10px] font-black uppercase">Cancelada</span>
                      ) : c.pago ? (
                        <span className="flex-shrink-0 text-emerald-400 text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={11} /> Pago</span>
                      ) : (
                        <div className="flex-shrink-0 flex items-center gap-2">
                          {(c.bankSlipUrl || c.invoiceUrl) && (
                            <a href={c.bankSlipUrl || c.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-[10px] font-black uppercase">Abrir ↗</a>
                          )}
                          <button
                            onClick={() => verificarStatusCobranca(c.asaasPaymentId, v)}
                            disabled={verificandoCobranca === c.asaasPaymentId}
                            title="Consultar status direto na Asaas"
                            className="text-slate-400 hover:text-white disabled:opacity-50 text-[10px] font-black uppercase"
                          >
                            {verificandoCobranca === c.asaasPaymentId ? '...' : 'Verificar'}
                          </button>
                          <button
                            onClick={() => cancelarCobranca(c.asaasPaymentId, v)}
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
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => { setDetalheVenda(null); editarOrcamento(v); }} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2"><Pencil size={13} /> Editar venda</button>
              <button onClick={() => { setDetalheVenda(null); abrirContrato(v); }} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2"><PenTool size={13} /> Contrato</button>
            </div>
          </div>
        </div>
      </div>
    );
  })();

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  if (!vendaDiretaPulse) {
    return (
      <div className="md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <ShoppingBag size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">Com o CRM ativo, as vendas são feitas pelo funil de Vendas.</p>
          <Link href="/deals" className="inline-block mt-4 bg-[var(--cor-primaria)] text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest">Ir para Vendas</Link>
        </div>
      </div>
    );
  }

  if (vendaConcluida) {
    const ehOrcamento = vendaConcluida.status === 'orcamento';
    return (
      <div className="md:p-8 pb-20 text-white flex items-center justify-center min-h-[70vh]">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center">
          <CheckCircle2 size={40} className={`mx-auto mb-3 ${ehOrcamento ? 'text-purple-400' : 'text-[var(--cor-primaria)]'}`} />
          <p className="text-white font-black text-lg uppercase">{ehOrcamento ? 'Orçamento salvo!' : 'Venda registrada!'}</p>
          <p className="text-slate-400 text-sm mt-1">{formatId(vendaConcluida.id)} · {vendaConcluida.empresa}</p>
          <p className={`text-3xl font-black mt-4 ${ehOrcamento ? 'text-purple-400' : 'text-[var(--cor-primaria)]'}`}>R$ {vendaConcluida.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          {ehOrcamento && <p className="text-slate-500 text-[10px] mt-2">Sem efeito no estoque/financeiro ainda — converte em pedido no Painel quando o cliente aprovar.</p>}
          {!ehOrcamento && avisoPortal && (
            <p className={`mt-4 text-[11px] font-bold rounded-xl px-3 py-2 flex items-center justify-center gap-1.5 ${avisoPortal.ok ? 'bg-sky-500/10 border border-sky-500/20 text-sky-300' : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'}`}>
              <Globe size={12} className="shrink-0" /> {avisoPortal.texto}
            </p>
          )}

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
    <div className="md:p-8 pb-20 text-white">
      <header className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-2 md:gap-3">
            <ShoppingBag className="w-6 h-6 md:w-8 md:h-8 shrink-0" /> Nova Venda
          </h1>
          <p className="hidden md:block text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Monte o pedido e feche na hora — ou salve como orçamento</p>
        </div>
        <button onClick={toggleHistorico} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all self-start md:self-auto">
          <History size={14} /> Histórico de vendas {mostrarHistorico ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </header>

      {mostrarHistorico && (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden mb-5">
          <div className="p-4 md:p-5 border-b border-white/5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="font-black uppercase text-sm text-slate-300">Vendas e orçamentos</h3>
              <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[var(--cor-primaria)] md:w-72">
                <Search size={13} className="text-slate-500 flex-shrink-0" />
                <input value={buscaHistorico} onChange={e => setBuscaHistorico(e.target.value)} placeholder="Buscar cliente ou protocolo (todo o histórico)" className="flex-1 bg-transparent outline-none text-white text-xs min-w-0" />
                {buscaHistorico && <button onClick={() => setBuscaHistorico('')} className="text-slate-500 hover:text-white"><X size={12} /></button>}
              </div>
            </div>

            {/* Período */}
            <div className={`faixa-scroll md:flex-wrap gap-1.5 items-center ${buscaHistorico.trim().length >= 2 ? 'opacity-40 pointer-events-none' : ''}`}>
              {([['mes', 'Este mês'], ['mes_ant', 'Mês passado'], ['90d', '90 dias'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['custom', 'Personalizado']] as [PeriodoHist, string][]).map(([v, l]) => (
                <button key={v} onClick={() => setPeriodoHist(v)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors ${periodoHist === v ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'bg-white/5 text-slate-400 hover:text-white'}`}>{l}</button>
              ))}
              {periodoHist === 'custom' && (
                <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                  <input type="date" value={dataIniHist} onChange={e => setDataIniHist(e.target.value)} className="bg-transparent text-white text-[10px] font-bold outline-none" />
                  <span className="text-slate-600 text-[10px]">até</span>
                  <input type="date" value={dataFimHist} onChange={e => setDataFimHist(e.target.value)} className="bg-transparent text-white text-[10px] font-bold outline-none" />
                </div>
              )}
            </div>
            {buscaHistorico.trim().length >= 2 && <p className="text-[10px] text-slate-500 -mt-1">Buscando em todo o histórico — o filtro de período fica pausado enquanto houver busca.</p>}

            {/* Resumo do período */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Faturado</p>
                <p className="text-base font-black text-[var(--cor-primaria)] truncate">R$ {totalHistoricoFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Vendas · ticket médio</p>
                <p className="text-base font-black text-white truncate">{vendasPeriodo.length} <span className="text-slate-500 text-xs font-bold">· R$ {(vendasPeriodo.length ? totalHistoricoFiltrado / vendasPeriodo.length : 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span></p>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Orçamentos em aberto</p>
                <p className="text-base font-black text-purple-400 truncate">{orcamentosPeriodo.length} <span className="text-slate-500 text-xs font-bold">· R$ {valorOrcamentosPeriodo.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span></p>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Contrato pendente</p>
                <p className={`text-base font-black truncate ${contagemHist.contrato_pendente ? 'text-amber-400' : 'text-white'}`}>{contagemHist.contrato_pendente}</p>
              </div>
            </div>

            {/* Tipo / vendedor / ordem */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className="faixa-scroll gap-1.5 flex-1">
                {([['todos', 'Tudo'], ['vendas', 'Vendas'], ['orcamentos', 'Orçamentos'], ['estornadas', 'Estornadas'], ['contrato_pendente', 'Contrato pendente']] as [TipoHist, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setTipoHist(v)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap border transition-colors ${tipoHist === v ? 'bg-white text-[#0B1120] border-white' : 'border-white/10 text-slate-400 hover:text-white'}`}>
                    {l} <span className="opacity-60">({contagemHist[v]})</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {isLideranca && Object.keys(usersMap || {}).length > 0 && (
                  <select value={vendedorHist} onChange={e => setVendedorHist(e.target.value)} className="flex-1 md:flex-none bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase text-slate-300 outline-none">
                    <option value="todos" className="bg-[#0B1120]">Todos vendedores</option>
                    {Object.entries(usersMap).map(([id, nome]) => <option key={id} value={id} className="bg-[#0B1120]">{nome}</option>)}
                  </select>
                )}
                <select value={ordemHist} onChange={e => setOrdemHist(e.target.value as 'recentes' | 'valor')} className="flex-1 md:flex-none bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase text-slate-300 outline-none">
                  <option value="recentes" className="bg-[#0B1120]">Mais recentes</option>
                  <option value="valor" className="bg-[#0B1120]">Maior valor</option>
                </select>
              </div>
            </div>
          </div>
          {carregandoHistorico ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
          ) : historicoFiltrado.length === 0 ? (
            <div className="p-8 text-center"><p className="text-slate-500 text-sm font-bold">{buscaHistorico.trim() ? 'Nada encontrado pra essa busca.' : 'Nada nesse período com esse filtro.'}</p></div>
          ) : (
            <div className="divide-y divide-white/5 max-h-[34rem] overflow-y-auto">
              {historicoFiltrado.map(h => {
                const ehOrc = h.status === 'orcamento';
                const estornada = ehEstornada(h);
                const itens = Array.isArray(h.itens) ? h.itens : [];
                const dataRef = ehOrc ? h.created_at : (h.fechado_em || h.created_at);
                return (
                  <div key={h.id} className="flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetalheVenda(h)} title="Ver detalhes da venda">
                      <p className="text-white font-bold text-sm truncate hover:underline">{formatId(h.id)} · {h.empresa}</p>
                      <p className="text-slate-500 text-[10px] truncate">
                        {itens.map((it: any) => `${it.quantidade}x ${it.servico}`).join(', ')} · {ehOrc ? 'criado' : estornada ? 'estornada' : 'fechada'} em {new Date(estornada && h.estornado_em ? h.estornado_em : dataRef).toLocaleDateString('pt-BR')}
                        {vendedorHist === 'todos' && isLideranca && h.user_id && usersMap?.[h.user_id] ? ` · ${usersMap[h.user_id]}` : ''}
                      </p>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full flex-shrink-0 ${estornada ? 'text-red-400 bg-red-500/10' : ehOrc ? 'text-purple-400 bg-purple-500/10' : 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]'}`}>
                      {estornada ? 'Estornada' : ehOrc ? 'Orçamento' : 'Venda'}
                    </span>
                    <span className={`font-black text-sm flex-shrink-0 whitespace-nowrap text-right ${estornada ? 'text-slate-500 line-through' : 'text-white'}`}>R$ {Number(h.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    {!ehOrc && !estornada && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {h.docuseal_assinado && Array.isArray(h.docuseal_arquivos) && h.docuseal_arquivos.length > 0 && (
                          <button onClick={() => abrirArquivoAssinado(h.docuseal_arquivos[0].path)} title="Ver contrato assinado" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-500/10 text-emerald-500 hover:text-emerald-400"><FileCheck size={13} /></button>
                        )}
                        <button onClick={() => editarOrcamento(h)} title="Editar venda (cliente, itens, pagamento)" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-500/10 text-slate-600 hover:text-amber-400"><Pencil size={13} /></button>
                        <button onClick={() => abrirContrato(h)} title="Gerar contrato" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-purple-500/10 text-slate-600 hover:text-purple-400"><PenTool size={13} /></button>
                        <button onClick={() => emitirNf1(h)} title="Emitir NF" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-500/10 text-slate-600 hover:text-blue-400"><FileText size={13} /></button>
                        <button onClick={() => abrirCobranca(h)} title="Gerar boleto/Pix" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400"><Zap size={13} /></button>
                      </div>
                    )}
                    {ehOrc && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => editarOrcamento(h)} title="Abrir pra revisar e converter em venda" className="h-7 px-2 flex items-center gap-1 rounded-lg bg-[rgb(var(--cor-primaria-rgb)/10%)] border border-[rgb(var(--cor-primaria-rgb)/30%)] text-[var(--cor-primaria)] hover:bg-[rgb(var(--cor-primaria-rgb)/20%)] text-[9px] font-black uppercase"><BadgeCheck size={12} /> Converter</button>
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
                  <p className="text-white font-bold text-sm uppercase">{clienteSelecionado.nome_empresa}</p>
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
                      // Preço (e descrição) já podem ter sido customizados só nesta venda — reabrir
                      // pra editar outra coisa (ex: um extra) não pode voltar pro valor do
                      // catálogo e perder isso; mescla o que já estava salvo na linha do carrinho
                      // por cima do cadastro original.
                      abrirConfigurador({ ...servicoOriginal, preco: i.precoUnitario, descricao: i.descricao ?? servicoOriginal.descricao, prazo_fabricacao_dias: i.prazoFabricacaoDias ?? servicoOriginal.prazo_fabricacao_dias }, i.configuracoes || [], true);
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
                <CampoMoeda value={desconto} onChange={v => setDesconto(Math.max(0, v))} className="w-24 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right outline-none focus:border-[var(--cor-primaria)]" placeholder="0" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-bold text-xs">Acréscimo R$</span>
                <CampoMoeda value={acrescimo} onChange={v => setAcrescimo(Math.max(0, v))} className="w-24 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right outline-none focus:border-[var(--cor-primaria)]" placeholder="0" />
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
              <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Pagamento{Number(valorEntrada) > 0 ? ' (saldo)' : ''}</label>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(FORMAS_PAGAMENTO).map(([valorPg, labelPg]) => (
                  <button key={valorPg} onClick={() => setFormaPagamento(valorPg)} className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${formaPagamento === valorPg ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{labelPg}</button>
                ))}
              </div>
            </div>

            {/* Entrada + parcelas do saldo — mesmos campos que "Gerar contrato" edita depois;
            ajustáveis já aqui, na criação ou na edição da venda, sem precisar abrir outra tela. */}
            <div className="border-t border-white/5 pt-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Entrada e parcelas (opcional)</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Entrada — R$</label>
                  <CampoMoeda value={Number(valorEntrada) || 0} onChange={v => setValorEntrada(v ? String(v) : '')} placeholder="Ex: 56.970,00" className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[var(--cor-primaria)]" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Pagamento da entrada</label>
                  <select value={formaPagamentoEntrada} onChange={e => setFormaPagamentoEntrada(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[var(--cor-primaria)]">
                    <option value="" className="bg-[#0B1120]">—</option>
                    {Object.entries(FORMAS_PAGAMENTO).map(([valorPg, labelPg]) => <option key={valorPg} value={valorPg} className="bg-[#0B1120]">{labelPg}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Parcelas (saldo)</label>
                  <input type="number" min="1" value={parcelasSaldo} onChange={e => setParcelasSaldo(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[var(--cor-primaria)]" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">1º vencimento</label>
                  <input type="date" value={vencimentoSaldo} onChange={e => setVencimentoSaldo(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[var(--cor-primaria)]" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-slate-600 text-[9px]">Clique pra abrir uma linha editável por parcela (carnê) — dá pra deixar valores diferentes entre si.</p>
                <button type="button" onClick={gerarParcelasIguais} className="text-[9px] font-black uppercase text-[var(--cor-primaria)] hover:brightness-110 shrink-0 ml-2">Gerar {parcelasSaldo || 1}x iguais</button>
              </div>
              {erroParcelasDetalhe && <p className="text-red-400 text-[10px] font-bold mt-1">{erroParcelasDetalhe}</p>}
              {parcelasDetalhe.length > 0 && (
                <div className="space-y-1.5 mt-2 border-t border-white/5 pt-2">
                  {parcelasDetalhe.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-500 font-bold w-5 shrink-0">{i + 1}ª</span>
                      <input type="date" value={p.data} onChange={e => atualizarParcelaDetalhe(i, { data: e.target.value })} className="flex-1 bg-black/40 border border-white/10 rounded-lg py-2 px-2 text-white text-xs outline-none focus:border-[var(--cor-primaria)]" />
                      <CampoMoeda value={p.valor || 0} onChange={v => atualizarParcelaDetalhe(i, { valor: v })} placeholder="R$" className="w-28 bg-black/40 border border-white/10 rounded-lg py-2 px-2 text-white text-xs outline-none focus:border-[var(--cor-primaria)]" />
                      <button type="button" onClick={() => removerParcelaDetalhe(i)} className="text-slate-500 hover:text-red-400 p-1 shrink-0"><X size={13} /></button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <button type="button" onClick={adicionarParcelaDetalhe} className="text-[9px] font-black uppercase text-slate-400 hover:text-white">+ Adicionar parcela avulsa</button>
                    <p className="text-[10px] text-slate-500 font-bold">Soma: R$ {parcelasDetalhe.reduce((s, p) => s + (Number(p.valor) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <button type="button" onClick={() => setParcelasDetalhe([])} className="text-[9px] font-black uppercase text-slate-600 hover:text-red-400">Limpar carnê (volta pra parcelas iguais)</button>
                </div>
              )}
            </div>
          </div>

          {erro && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle size={14} className="flex-shrink-0" /> {erro}
            </div>
          )}

          {orcamentoEditandoId ? (
            <div className="space-y-2">
              <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Pencil size={11} /> Editando {editandoLabel} {formatId(orcamentoEditandoId)}</p>
              {editandoLabel === 'orçamento' && (
                <button
                  onClick={() => { if (window.confirm(`Converter o orçamento ${formatId(orcamentoEditandoId)} em VENDA?\n\nIsso lança no financeiro, baixa o estoque e inicia a produção — igual a "Fechar venda".`)) finalizarVenda('pedido'); }}
                  disabled={salvando}
                  className="w-full bg-[var(--cor-primaria)] hover:brightness-110 disabled:opacity-50 text-[#0B1120] font-black uppercase text-sm py-4 rounded-xl flex items-center justify-center gap-2 shadow-[0_8px_30px_rgb(var(--cor-primaria-rgb)/30%)] transition-all"
                >
                  {salvando ? <Loader2 size={18} className="animate-spin" /> : <BadgeCheck size={18} />}
                  {salvando ? 'Convertendo...' : 'Converter em venda'}
                </button>
              )}
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
                        <CampoMoeda value={produtoDetalhe.preco || 0} onChange={v => setProdutoDetalhe(prev => prev && { ...prev, preco: v })} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-[var(--cor-primaria)]" />
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
                    <div className="mt-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Valor (só nesta venda — não altera o cadastro do produto)</label>
                      <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 focus-within:border-[var(--cor-primaria)]">
                        <span className="text-[var(--cor-primaria)] font-black text-lg shrink-0">R$</span>
                        <CampoMoeda
                          value={produtoDetalhe.preco || 0}
                          onChange={v => setProdutoDetalhe(prev => prev && { ...prev, preco: v })}
                          className="w-full bg-transparent text-[var(--cor-primaria)] font-black text-xl py-2.5 outline-none"
                        />
                      </div>
                    </div>
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
      {renderModalDetalheVenda()}
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
