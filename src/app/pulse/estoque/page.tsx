"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import JsBarcode from 'jsbarcode';
import { ShoppingCart, Truck, Loader2, Activity, Boxes, Package, Minus, Plus, ScanLine, X, Wallet, AlertTriangle, Pencil, Search, ListTree, Receipt, TrendingDown, TrendingUp, BarChart3, ClipboardCheck, ChevronRight, Percent, FileText, Wand2, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ordenarPorNome } from '@/lib/ordenacao';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig, alertarEstoqueBaixoSeCruzou } from '../shared';
import LancarNotaFiscalModal from '@/components/LancarNotaFiscalModal';
import VerNotaFiscalModal from '@/components/VerNotaFiscalModal';
import { calcularAlertasReposicao } from '@/lib/estoqueInteligente';

type Movimentacao = {
  id: number; quantidade: number; valor_unitario: number | null; fornecedor: string | null;
  nf_numero: string | null; nf_chave_acesso: string | null; created_at: string;
  tipo: string; motivo: string | null; observacao: string | null;
};

const TIPO_LABEL: Record<string, { label: string; cor: string }> = {
  entrada_nf: { label: 'Nota Fiscal (entrada)', cor: 'text-purple-400 bg-purple-500/10' },
  saida_nf: { label: 'Nota Fiscal (saída)', cor: 'text-orange-400 bg-orange-500/10' },
  ajuste: { label: 'Ajuste manual', cor: 'text-blue-400 bg-blue-500/10' },
  venda: { label: 'Venda', cor: 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' },
  consumo_producao: { label: 'Consumo de produção', cor: 'text-amber-400 bg-amber-500/10' },
  estorno: { label: 'Estorno', cor: 'text-red-400 bg-red-500/10' },
};

const MOTIVO_LABEL: Record<string, string> = {
  compra: 'Compra', devolucao_cliente: 'Devolução de cliente', transferencia: 'Transferência',
  contagem: 'Contagem física', outros: 'Outros', venda: 'Venda', perda: 'Perda/quebra',
  devolucao_fornecedor: 'Devolução ao fornecedor', uso_interno: 'Uso interno',
  retrabalho: 'Retrabalho', producao: 'Uso em produção/obra', amostra: 'Amostra/brinde',
};

const MOTIVOS_ENTRADA = ['compra', 'devolucao_cliente', 'transferencia', 'contagem', 'outros'] as const;
const MOTIVOS_SAIDA = ['venda', 'perda', 'devolucao_fornecedor', 'transferencia', 'uso_interno', 'contagem'] as const;

export default function PulseEstoquePage() {
  const { authLoading, temPulse, user, perfil, isLideranca } = usePulseAccess();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(true);
  const [notaModalAberto, setNotaModalAberto] = useState(false);
  const [notaTipo, setNotaTipo] = useState<'entrada' | 'saida'>('entrada');

  // Etiqueta de código de barras — clica no item, gera e já manda pra impressão, sem tela
  // de seleção. Código de barras = SKU do produto (o mesmo lido na Saída Rápida). Abre numa
  // janelinha só com a etiqueta em vez de esconder a página inteira via CSS de impressão
  // (frágil — dependeria de conhecer o DOM completo do layout do app, navbar incluída).
  const imprimirEtiqueta = (s: ServicoConfig) => {
    if (!s.sku) { alert('Esse produto não tem SKU cadastrado — não dá pra gerar código de barras.'); return; }
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, s.sku, { format: 'CODE128', width: 1.6, height: 38, fontSize: 11, margin: 4 });
    } catch {
      alert('SKU com caractere que o código de barras (CODE128) não aceita.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank', 'width=320,height=220');
    if (!win) { alert('O navegador bloqueou a janela de impressão — permite pop-up pra esse site.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Etiqueta</title><style>
      @page { size: 58mm auto; margin: 0; }
      body { margin: 0; padding: 8px; font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; width: 58mm; }
      p { font-size: 9px; font-weight: 900; text-transform: uppercase; text-align: center; margin: 0 0 2px; }
      img { max-width: 100%; }
    </style></head><body>
      <p>${s.nome.replace(/</g, '')}</p>
      <img src="${dataUrl}" onload="window.print(); window.onafterprint = () => window.close();" />
    </body></html>`);
    win.document.close();
  };

  const [historicoServico, setHistoricoServico] = useState<ServicoConfig | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [abaDetalhe, setAbaDetalhe] = useState<'movimentacoes' | 'precos'>('movimentacoes');
  // Chave de acesso -> link do DANFE/XML da nota, pra abrir a NF direto da movimentação
  // sem precisar ir procurar em /pulse/fiscal.
  const [notasPorMovimentacao, setNotasPorMovimentacao] = useState<Record<number, { notaId: number; danfeUrl: string | null; xmlUrl: string | null }>>({});
  const [verNotaId, setVerNotaId] = useState<number | null>(null);

  const [ajusteServico, setAjusteServico] = useState<ServicoConfig | null>(null);
  const [ajusteTipo, setAjusteTipo] = useState<'entrada' | 'saida' | 'definir'>('entrada');
  const [ajusteQtd, setAjusteQtd] = useState('');
  const [ajusteMotivoCat, setAjusteMotivoCat] = useState<string>('compra');
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);

  const [busca, setBusca] = useState('');
  const [soBaixo, setSoBaixo] = useState(false);

  // Consumo dos últimos 30 dias, só pra calcular o ritmo de reposição — não é o Kardex
  // completo (esse já tem tela própria em /pulse/estoque/movimentacoes).
  const [consumoRecente, setConsumoRecente] = useState<{ servico_id: number; quantidade: number; created_at: string }[]>([]);

  // Última NF associada a cada produto — mesma resolução em 3 caminhos usada no modal de
  // detalhe (item→nota, nota→movimentação direto, ou chave de acesso), só que calculada
  // pra todo o catálogo de uma vez em vez de por produto ao abrir o detalhe.
  // custo médio ponderado / último custo por item (view pulse_estoque_custos) + fornecedores ativos
  const [custos, setCustos] = useState<Record<number, { custo_medio: number | null; ultimo_custo: number | null; ultima_entrada: string | null }>>({});
  const [fornecedores, setFornecedores] = useState<{ id: number; nome: string }[]>([]);
  const [nfPorServico, setNfPorServico] = useState<Record<number, { notaId: number | null; numero: string }>>({});

  const fetchServicos = async () => {
    setLoadingServicos(true);
    const { data } = await supabase.from('servicos').select('*').order('nome', { ascending: true });
    if (data) setServicos(ordenarPorNome(data as ServicoConfig[]));
    setLoadingServicos(false);
  };

  useEffect(() => {
    fetchServicos();
    supabase.from('pulse_estoque_custos').select('servico_id, custo_medio, ultimo_custo, ultima_entrada')
      .then(({ data }) => { if (data) setCustos(Object.fromEntries(data.map((c: any) => [c.servico_id, c]))); });
    supabase.from('pulse_fornecedores').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setFornecedores(data as { id: number; nome: string }[]); });
    const desde = new Date(Date.now() - 30 * 86400000).toISOString();
    supabase.from('estoque_movimentacoes').select('servico_id, quantidade, created_at').lt('quantidade', 0).gte('created_at', desde)
      .then(({ data }) => { if (data) setConsumoRecente(data); });
  }, []);

  useEffect(() => {
    const ids = servicos.filter(s => s.estoque !== null && s.estoque !== undefined).map(s => s.id);
    if (ids.length === 0) { setNfPorServico({}); return; }
    (async () => {
      type MovComNf = { id: number; servico_id: number; nf_numero: string; nf_chave_acesso: string | null };
      const { data: movs } = await supabase.from('estoque_movimentacoes')
        .select('id, servico_id, nf_numero, nf_chave_acesso')
        .in('servico_id', ids).not('nf_numero', 'is', null).order('created_at', { ascending: true });
      if (!movs || movs.length === 0) { setNfPorServico({}); return; }

      // Ordenado crescente — a última sobrescreve, sobra sempre a NF mais recente por produto.
      const ultimoPorServico = new Map<number, MovComNf>();
      (movs as MovComNf[]).forEach(m => ultimoPorServico.set(m.servico_id, m));

      const movIds = [...ultimoPorServico.values()].map(m => m.id);
      const chaves = [...new Set([...ultimoPorServico.values()].map(m => m.nf_chave_acesso).filter((c): c is string => !!c))];

      const [{ data: itensLink }, { data: notasDireto }, { data: notasPorChaveRes }] = await Promise.all([
        supabase.from('fiscal_notas_itens').select('estoque_movimentacao_id, nota_id').in('estoque_movimentacao_id', movIds),
        supabase.from('fiscal_notas').select('id, estoque_movimentacao_id').in('estoque_movimentacao_id', movIds),
        chaves.length > 0
          ? supabase.from('fiscal_notas').select('id, chave_acesso').in('chave_acesso', chaves)
          : Promise.resolve({ data: [] as { id: number; chave_acesso: string | null }[] }),
      ]);

      const notaIdPorMov: Record<number, number> = {};
      (itensLink || []).forEach((l: any) => { notaIdPorMov[l.estoque_movimentacao_id] = l.nota_id; });
      (notasDireto || []).forEach((n: any) => { if (n.estoque_movimentacao_id != null && notaIdPorMov[n.estoque_movimentacao_id] == null) notaIdPorMov[n.estoque_movimentacao_id] = n.id; });
      const notaPorChave = new Map((notasPorChaveRes || []).map((n: any) => [n.chave_acesso, n.id]));

      const mapa: Record<number, { notaId: number | null; numero: string }> = {};
      ultimoPorServico.forEach((m, servicoId) => {
        const notaId = notaIdPorMov[m.id] ?? (m.nf_chave_acesso ? notaPorChave.get(m.nf_chave_acesso) ?? null : null);
        mapa[servicoId] = { notaId, numero: m.nf_numero };
      });
      setNfPorServico(mapa);
    })();
  }, [servicos]);


  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);
  const valorTotalEstoque = produtosComEstoque.reduce((acc, s) => acc + (s.preco || 0) * (s.estoque || 0), 0);
  const produtosBaixo = produtosComEstoque.filter(s => (s.estoque as number) <= (s.estoque_minimo ?? 5));
  const alertasReposicao = calcularAlertasReposicao(servicos, consumoRecente);

  const combina = (s: ServicoConfig) => {
    if (soBaixo && (s.estoque as number) > (s.estoque_minimo ?? 5)) return false;
    if (!busca.trim()) return true;
    return s.nome.toLowerCase().includes(busca.trim().toLowerCase()) || (s.sku || '').toLowerCase().includes(busca.trim().toLowerCase());
  };

  // Separado por tipo — matéria-prima e produto acabado misturados na mesma lista
  // confundia (ex: fábrica de trailer via chapa de aço junto com o trailer pronto).
  // Sem divisão por tipo — Trailer Travel só vende sob encomenda (nunca guarda produto
  // pronto no estoque), então a antiga seção "Produtos acabados" ficava sempre cheia de
  // insumo mal classificado e nunca de produto de verdade. Uma lista só é mais honesta
  // com o que o estoque controlado realmente é aqui: matéria-prima/insumo.
  const itensFiltrados = produtosComEstoque.filter(combina);

  const ajustarEstoque = async (s: ServicoConfig, delta: number) => {
    const atual = s.estoque || 0;
    const novo = Math.max(0, atual + delta);
    const deltaReal = novo - atual;
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
    if (deltaReal !== 0) {
      await supabase.from('estoque_movimentacoes').insert([{
        empresa_id: perfil?.empresa_id, servico_id: s.id, quantidade: deltaReal,
        tipo: 'ajuste', user_id: user?.id,
      }]);
      alertarEstoqueBaixoSeCruzou(s.id, atual, novo, s.estoque_minimo ?? 5);
    }
  };

  // Estoque mínimo é o limiar que dispara o alerta de "estoque baixo" — mora aqui (não
  // mais em Configurações → Produtos) porque é dado operacional de estoque, não
  // identidade do produto. Movido de lá pra cá pra não ficar controle de quantidade
  // espalhado em duas telas diferentes.
  const atualizarMinimo = async (s: ServicoConfig, valor: number) => {
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque_minimo: valor } : x));
    await supabase.from('servicos').update({ estoque_minimo: valor }).eq('id', s.id);
  };

  // Mesma lógica de Configurações → Produtos (settings/page.tsx) — SKU editável e
  // gerável direto por aqui também, porque é no Estoque que o time realmente mexe no
  // catálogo no dia a dia, não em Configurações.
  const gerarSkuAutomatico = (nome: string) => {
    const prefixo = (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PRD';
    const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefixo}-${sufixo}`;
  };

  const atualizarSku = async (s: ServicoConfig, valor: string) => {
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, sku: valor } : x));
    setHistoricoServico(prev => prev && prev.id === s.id ? { ...prev, sku: valor } : prev);
    await supabase.from('servicos').update({ sku: valor || null }).eq('id', s.id);
  };

  const salvarCampoServico = async (s: ServicoConfig, patch: Partial<ServicoConfig>) => {
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, ...patch } : x));
    setHistoricoServico(prev => prev && prev.id === s.id ? { ...prev, ...patch } : prev);
    await supabase.from('servicos').update(patch).eq('id', s.id);
  };

  const abrirAjuste = (s: ServicoConfig) => {
    setAjusteServico(s); setAjusteTipo('entrada'); setAjusteQtd(''); setAjusteMotivo(''); setAjusteMotivoCat('compra');
  };

  const confirmarAjuste = async () => {
    if (!ajusteServico) return;
    const qtd = Number(ajusteQtd);
    if (!qtd || qtd < 0) return;
    setSalvandoAjuste(true);
    const atual = ajusteServico.estoque || 0;
    const novo = ajusteTipo === 'entrada' ? atual + qtd : ajusteTipo === 'saida' ? Math.max(0, atual - qtd) : Math.max(0, qtd);
    const deltaReal = novo - atual;
    setServicos(prev => prev.map(x => x.id === ajusteServico.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', ajusteServico.id);
    if (deltaReal !== 0) {
      await supabase.from('estoque_movimentacoes').insert([{
        empresa_id: perfil?.empresa_id, servico_id: ajusteServico.id, quantidade: deltaReal,
        tipo: 'ajuste', motivo: ajusteTipo === 'definir' ? 'contagem' : ajusteMotivoCat,
        user_id: user?.id, observacao: ajusteMotivo.trim() || null,
      }]);
      alertarEstoqueBaixoSeCruzou(ajusteServico.id, atual, novo, ajusteServico.estoque_minimo ?? 5);
    }
    setSalvandoAjuste(false);
    setAjusteServico(null);
  };

  const abrirHistorico = async (s: ServicoConfig) => {
    setHistoricoServico(s);
    setAbaDetalhe('movimentacoes');
    setCarregandoHistorico(true);
    setNotasPorMovimentacao({});
    const { data } = await supabase.from('estoque_movimentacoes').select('*').eq('servico_id', s.id).order('created_at', { ascending: false });
    const movs = (data || []) as Movimentacao[];
    setMovimentacoes(movs);
    setCarregandoHistorico(false);
    if (movs.length === 0) return;

    // Três jeitos de achar a nota de uma movimentação, do mais preciso pro mais frouxo:
    // 1) fiscal_notas_itens.estoque_movimentacao_id — link item a item (LancarNotaFiscalModal);
    // 2) fiscal_notas.estoque_movimentacao_id — link direto na nota, só o último item de
    //    cada nota (NotaFiscalModal, o modal mais antigo/simples de foto);
    // 3) nf_chave_acesso — só existe quando a nota tem chave de 44 dígitos (Focus NFe/XML),
    //    nota manual/foto raramente tem. Sem essas três, nota manual sem chave nunca achava
    //    link nenhum e o botão "Abrir NF" nunca aparecia pra maioria dos lançamentos.
    const movIds = movs.map(m => m.id);
    const chaves = [...new Set(movs.map(m => m.nf_chave_acesso).filter((c): c is string => !!c))];

    const [{ data: itensLink }, { data: notasDireto }, { data: notasPorChaveRes }] = await Promise.all([
      supabase.from('fiscal_notas_itens').select('estoque_movimentacao_id, nota_id').in('estoque_movimentacao_id', movIds),
      supabase.from('fiscal_notas').select('id, estoque_movimentacao_id, danfe_url, xml_url').in('estoque_movimentacao_id', movIds),
      chaves.length > 0
        ? supabase.from('fiscal_notas').select('id, chave_acesso, danfe_url, xml_url').in('chave_acesso', chaves)
        : Promise.resolve({ data: [] as { id: number; chave_acesso: string | null; danfe_url: string | null; xml_url: string | null }[] }),
    ]);

    const notaIdsPorItem = [...new Set((itensLink || []).map(l => l.nota_id))];
    const { data: notasPorItemRes } = notaIdsPorItem.length > 0
      ? await supabase.from('fiscal_notas').select('id, danfe_url, xml_url').in('id', notaIdsPorItem)
      : { data: [] as { id: number; danfe_url: string | null; xml_url: string | null }[] };
    const notaPorId = new Map((notasPorItemRes || []).map(n => [n.id, n]));

    const mapa: Record<number, { notaId: number; danfeUrl: string | null; xmlUrl: string | null }> = {};
    (itensLink || []).forEach(l => {
      const nota = notaPorId.get(l.nota_id);
      if (nota) mapa[l.estoque_movimentacao_id] = { notaId: nota.id, danfeUrl: nota.danfe_url, xmlUrl: nota.xml_url };
    });
    (notasDireto || []).forEach(n => {
      if (n.estoque_movimentacao_id != null && !mapa[n.estoque_movimentacao_id]) {
        mapa[n.estoque_movimentacao_id] = { notaId: n.id, danfeUrl: n.danfe_url, xmlUrl: n.xml_url };
      }
    });
    const notaPorChave = new Map((notasPorChaveRes || []).map(n => [n.chave_acesso, n]));
    movs.forEach(m => {
      if (!mapa[m.id] && m.nf_chave_acesso) {
        const nota = notaPorChave.get(m.nf_chave_acesso);
        if (nota) mapa[m.id] = { notaId: nota.id, danfeUrl: nota.danfe_url, xmlUrl: nota.xml_url };
      }
    });
    setNotasPorMovimentacao(mapa);
  };

  // Grid fixo (não flex) — colunas sempre alinhadas de linha em linha (Produto/SKU/NF/
  // Preço/Estoque/Mín. sempre na mesma posição horizontal), em vez do bloco de texto
  // corrido + botões soltos de antes. Cabeçalho abaixo usa o MESMO template de colunas.
  const COLUNAS_ESTOQUE = 'grid-cols-[40px_minmax(0,1fr)_100px_100px_90px_128px_64px_64px]';

  const renderLinhaEstoque = (s: ServicoConfig) => {
    const baixo = (s.estoque as number) <= (s.estoque_minimo ?? 5);
    const nf = nfPorServico[s.id];
    return (
      <div key={s.id} onClick={() => abrirHistorico(s)} className={`grid ${COLUNAS_ESTOQUE} items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors`}>
        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
          {s.imagem_url ? <img src={s.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={15} className="text-slate-600" />}
        </div>

        <div className="min-w-0">
          <p className="text-white font-bold text-sm truncate">{s.nome}</p>
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {s.tipo && <span className="text-[8px] font-black bg-white/5 text-slate-500 px-1.5 py-0.5 rounded uppercase">{s.tipo}</span>}
            {s.localizacao && <span className="text-[8px] font-black bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded uppercase">📍 {s.localizacao}</span>}
            {s.estoque_maximo != null && (s.estoque as number) > s.estoque_maximo && <span className="text-[8px] font-black bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded uppercase">acima do máx.</span>}
          </div>
        </div>

        <p className="text-slate-400 text-[11px] font-mono font-bold truncate" title={s.sku || ''}>{s.sku || '—'}</p>

        {nf ? (
          nf.notaId != null ? (
            <button onClick={e => { e.stopPropagation(); setVerNotaId(nf.notaId); }} className="inline-flex items-center gap-1 text-[11px] font-black text-purple-400 hover:text-purple-300 truncate w-fit">
              <FileText size={11} className="flex-shrink-0" /> {nf.numero}
            </button>
          ) : (
            <span className="text-slate-500 text-[11px] font-bold truncate">{nf.numero}</span>
          )
        ) : (
          <span className="text-slate-700 text-[11px]">—</span>
        )}

        <div className="min-w-0">
          <p className="text-slate-300 text-xs font-bold truncate">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          {custos[s.id]?.custo_medio != null && <p className="text-[9px] text-slate-500 font-bold truncate" title="Custo médio ponderado das entradas">custo méd. R$ {Number(custos[s.id].custo_medio).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {isLideranca && (
            <button onClick={e => { e.stopPropagation(); ajustarEstoque(s, -1); }} title="Retirada manual — dar saída pelo leitor em /pulse/estoque/saida-rapida é o padrão" className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 flex-shrink-0"><Minus size={12} /></button>
          )}
          <span className={`text-sm font-black w-7 text-center flex-shrink-0 ${baixo ? 'text-red-400' : 'text-white'}`}>{s.estoque}</span>
          <button onClick={e => { e.stopPropagation(); ajustarEstoque(s, 1); }} className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 flex-shrink-0"><Plus size={12} /></button>
        </div>

        <div onClick={e => e.stopPropagation()} title="Estoque mínimo — dispara o alerta de estoque baixo">
          <input
            type="number" min="0" value={s.estoque_minimo ?? 5}
            onChange={e => atualizarMinimo(s, e.target.value === '' ? 0 : Number(e.target.value))}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-1 py-1 text-slate-300 text-xs text-center outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center justify-end gap-1.5">
          {baixo && <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />}
          <button onClick={e => { e.stopPropagation(); imprimirEtiqueta(s); }} title="Imprimir etiqueta com código de barras (SKU)" className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-blue-400 flex-shrink-0"><Tag size={12} /></button>
          {isLideranca && (
            <button onClick={e => { e.stopPropagation(); abrirAjuste(s); }} title="Ajuste manual (quantidade exata + motivo) — restrito, saída do dia a dia é pelo leitor" className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-amber-400 flex-shrink-0"><Pencil size={12} /></button>
          )}
          <ChevronRight size={14} className="text-slate-700 flex-shrink-0" />
        </div>
      </div>
    );
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
            <Boxes size={32} /> Estoque
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Ajuste rápido — salva na hora</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          <Link href="/pulse/estoque/saida-rapida" className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <ScanLine size={14} /> Saída Rápida
          </Link>
          <Link href="/pulse/estoque/compras" className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <ShoppingCart size={14} /> Compras
          </Link>
          <Link href="/pulse/estoque/fornecedores" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Truck size={14} /> Fornecedores
          </Link>
          <Link href="/pulse/estoque/movimentacoes" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <ListTree size={14} /> Kardex
          </Link>
          <Link href="/pulse/estoque/relatorio" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <BarChart3 size={14} /> Relatório
          </Link>
          <Link href="/pulse/estoque/contagem" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <ClipboardCheck size={14} /> Contagem
          </Link>
          <Link href="/pulse/fiscal" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Receipt size={14} /> Notas Fiscais
          </Link>
          <button onClick={() => { setNotaTipo('entrada'); setNotaModalAberto(true); }} className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <ScanLine size={14} /> Dar entrada por Nota Fiscal
          </button>
          {/* Saída manual liberada pro Almoxarifado (mesmo cargo que só enxerga Estoque/Notas
          Fiscais) — antes só existia entrada por aqui; pra dar saída sem passar pelo funil de
          venda (ex: baixa avulsa com NF de venda já emitida em mãos), precisa desse atalho. */}
          <button onClick={() => { setNotaTipo('saida'); setNotaModalAberto(true); }} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <ScanLine size={14} /> Dar saída por Nota Fiscal
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Package size={10} /> Produtos</p>
          <p className="text-2xl font-black text-white mt-1">{produtosComEstoque.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Wallet size={10} /> Valor em estoque</p>
          <p className="text-2xl font-black text-[var(--cor-primaria)] mt-1">R$ {valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
        <button onClick={() => setSoBaixo(v => !v)} className={`text-left bg-[#0F172A] border rounded-2xl p-4 transition-all ${soBaixo ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 hover:border-white/20'}`}>
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={10} /> Estoque baixo {soBaixo && '· filtrando'}</p>
          <p className={`text-2xl font-black mt-1 ${produtosBaixo.length > 0 ? 'text-red-400' : 'text-white'}`}>{produtosBaixo.length}</p>
        </button>
      </div>

      {alertasReposicao.length > 0 && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-purple-300 uppercase tracking-widest flex items-center gap-1.5 mb-3">
            <TrendingDown size={12} /> Reposição inteligente — pelo ritmo de consumo, vão zerar antes do prazo de repor
          </p>
          <div className="space-y-1.5">
            {alertasReposicao.slice(0, 8).map(a => (
              <div key={a.servicoId} className="flex items-center justify-between gap-3 bg-black/20 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-white font-bold text-xs truncate">{a.nome}</p>
                  <p className="text-slate-500 text-[10px]">{a.estoqueAtual} em estoque · consumindo ~{a.consumoDiario.toFixed(1)}/dia</p>
                </div>
                <span className={`shrink-0 text-xs font-black px-2 py-1 rounded ${a.diasRestantes <= a.limiarDias / 2 ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                  {Math.max(0, Math.floor(a.diasRestantes))}d restantes
                </span>
              </div>
            ))}
          </div>
          {alertasReposicao.length > 8 && <p className="text-slate-600 text-[10px] mt-2">+ {alertasReposicao.length - 8} outro(s) produto(s) nessa situação.</p>}
        </div>
      )}

      <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 mb-4 focus-within:border-[var(--cor-primaria)]">
        <Search size={14} className="text-slate-500 flex-shrink-0" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou SKU..." className="flex-1 bg-transparent outline-none text-white text-sm" />
        {busca && <button onClick={() => setBusca('')} className="text-slate-500 hover:text-white"><X size={14} /></button>}
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-black uppercase text-sm text-slate-300">Matéria-prima / insumos ({itensFiltrados.length})</h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Consumidos na Produção — pra cadastrar novo item, vai em Configurações → Catálogo</p>
        </div>
        {loadingServicos ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : itensFiltrados.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhum item com estoque controlado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className={`grid ${COLUNAS_ESTOQUE} items-center gap-3 px-4 py-2 border-b border-white/5 text-[9px] font-black text-slate-600 uppercase tracking-widest`}>
                <span />
                <span>Produto</span>
                <span>SKU</span>
                <span>NF</span>
                <span>Preço</span>
                <span className="text-center">Estoque</span>
                <span className="text-center">Mín.</span>
                <span />
              </div>
              <div className="divide-y divide-white/5">
                {ordenarPorNome(itensFiltrados).map(renderLinhaEstoque)}
              </div>
            </div>
          </div>
        )}
      </div>

      {historicoServico && (() => {
        const margemAtual = historicoServico.preco_custo != null && historicoServico.preco > 0
          ? ((historicoServico.preco - historicoServico.preco_custo) / historicoServico.preco) * 100
          : null;
        const historicoPrecos = [...(historicoServico.historico_precos || [])].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setHistoricoServico(null)}>
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Package size={18} className="text-purple-400" /> Detalhe do produto</h3>
                  <p className="text-slate-500 text-xs font-bold truncate">{historicoServico.nome}</p>
                </div>
                <button onClick={() => setHistoricoServico(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
              </div>

              <div className="flex items-center gap-3 bg-black/30 border border-white/5 rounded-2xl p-3 my-4">
                <div className="flex-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Venda</p>
                  <p className="text-white font-black text-sm">R$ {historicoServico.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                {historicoServico.preco_custo != null && (
                  <div className="flex-1">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Custo</p>
                    <p className="text-slate-300 font-bold text-sm">R$ {historicoServico.preco_custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                {margemAtual != null && (
                  <div className="flex-1">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Percent size={9} /> Margem</p>
                    <p className={`font-black text-sm ${margemAtual >= 0 ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>{margemAtual.toFixed(0)}%</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SKU</span>
                <input
                  value={historicoServico.sku ?? ''}
                  onChange={e => atualizarSku(historicoServico, e.target.value)}
                  placeholder="gerado automático se vazio"
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-bold outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={() => atualizarSku(historicoServico, gerarSkuAutomatico(historicoServico.nome))}
                  title="Gerar código automaticamente"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-purple-400 transition-all flex-shrink-0"
                >
                  <Wand2 size={13} />
                </button>
              </div>

              {(() => {
                const c = custos[historicoServico.id];
                const campo = 'w-full h-9 bg-black/30 border border-white/10 rounded-lg px-2.5 text-white text-xs font-bold outline-none focus:border-purple-500';
                const rot = 'block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1';
                return (
                  <div className="bg-black/20 border border-white/5 rounded-2xl p-4 mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Gestão do item</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <label className="block"><span className={rot}>Estoque máximo</span>
                        <input type="number" min="0" defaultValue={historicoServico.estoque_maximo ?? ''} key={`mx${historicoServico.id}`} onBlur={e => salvarCampoServico(historicoServico, { estoque_maximo: e.target.value === '' ? null : Number(e.target.value) })} className={campo} /></label>
                      <label className="block"><span className={rot}>Prazo de reposição (dias)</span>
                        <input type="number" min="0" defaultValue={historicoServico.prazo_reposicao_dias ?? ''} key={`pz${historicoServico.id}`} onBlur={e => salvarCampoServico(historicoServico, { prazo_reposicao_dias: e.target.value === '' ? null : Number(e.target.value) })} className={campo} /></label>
                      <label className="block"><span className={rot}>Localização</span>
                        <input defaultValue={historicoServico.localizacao ?? ''} key={`lc${historicoServico.id}`} placeholder="Galpão / prateleira" onBlur={e => salvarCampoServico(historicoServico, { localizacao: e.target.value.trim() || null })} className={campo} /></label>
                      <label className="block"><span className={rot}>Fornecedor padrão</span>
                        <select value={historicoServico.fornecedor_padrao_id ?? ''} onChange={e => salvarCampoServico(historicoServico, { fornecedor_padrao_id: e.target.value === '' ? null : Number(e.target.value) })} className={campo}>
                          <option value="" className="bg-[#0B1120]">—</option>{fornecedores.map(f => <option key={f.id} value={f.id} className="bg-[#0B1120]">{f.nome}</option>)}</select></label>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-white/5 text-center">
                      <div><p className={rot}>Custo médio</p><p className="text-white font-black text-sm">{c?.custo_medio != null ? `R$ ${Number(c.custo_medio).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p></div>
                      <div><p className={rot}>Último custo</p><p className="text-slate-300 font-bold text-sm">{c?.ultimo_custo != null ? `R$ ${Number(c.ultimo_custo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p></div>
                      <div><p className={rot}>Última entrada</p><p className="text-slate-300 font-bold text-sm">{c?.ultima_entrada ? new Date(c.ultima_entrada).toLocaleDateString('pt-BR') : '—'}</p></div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-1 bg-black/30 border border-white/10 rounded-xl p-1 mb-4">
                <button onClick={() => setAbaDetalhe('movimentacoes')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${abaDetalhe === 'movimentacoes' ? 'bg-purple-500 text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
                  Movimentações
                </button>
                <button onClick={() => setAbaDetalhe('precos')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${abaDetalhe === 'precos' ? 'bg-purple-500 text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
                  Histórico de preço {historicoPrecos.length > 0 && `(${historicoPrecos.length})`}
                </button>
              </div>

              {abaDetalhe === 'movimentacoes' ? (
                carregandoHistorico ? (
                  <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
                ) : movimentacoes.length === 0 ? (
                  <p className="text-slate-500 text-sm font-bold text-center py-10">Nenhuma movimentação registrada ainda pra esse produto.</p>
                ) : (
                  <div className="space-y-2">
                    {movimentacoes.map(m => {
                      const info = TIPO_LABEL[m.tipo] || { label: m.tipo, cor: 'text-slate-400 bg-white/5' };
                      const positivo = m.quantidade >= 0;
                      return (
                        <div key={m.id} className="bg-black/30 border border-white/5 rounded-2xl p-3">
                          <div className="flex items-center justify-between">
                            <span className={`font-black text-sm ${positivo ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>{positivo ? '+' : ''}{m.quantidade}</span>
                            <span className="text-slate-500 text-[10px]">{new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${info.cor}`}>{info.label}</span>
                            {m.motivo && <span className="text-[9px] font-black bg-white/5 text-slate-400 px-2 py-0.5 rounded uppercase">{MOTIVO_LABEL[m.motivo] || m.motivo}</span>}
                            {m.fornecedor && <span className="text-slate-300 text-xs font-bold">{m.fornecedor}</span>}
                            {m.nf_numero && <span title={m.nf_chave_acesso || ''} className="text-[9px] font-black bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded uppercase">NF {m.nf_numero}</span>}
                            {(() => {
                              const nota = notasPorMovimentacao[m.id];
                              return nota ? (
                                <button onClick={() => setVerNotaId(nota.notaId)} className="inline-flex items-center gap-1 text-[9px] font-black bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-2 py-0.5 rounded uppercase transition-colors">
                                  <FileText size={9} /> Ver NF
                                </button>
                              ) : null;
                            })()}
                            {m.observacao && <span className="text-slate-500 text-[10px]">{m.observacao}</span>}
                            {m.valor_unitario != null && <span className="text-slate-600 text-[10px]">R$ {m.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : historicoPrecos.length === 0 ? (
                <p className="text-slate-500 text-sm font-bold text-center py-10">Nenhuma mudança de preço registrada ainda — o histórico começa a partir da próxima edição em Configurações → Produtos.</p>
              ) : (
                <div className="space-y-2">
                  {historicoPrecos.map((h, idx) => {
                    const variacao = h.preco_anterior > 0 ? ((h.preco_novo - h.preco_anterior) / h.preco_anterior) * 100 : 0;
                    const subiu = h.preco_novo >= h.preco_anterior;
                    const margemNoMomento = historicoServico.preco_custo != null && h.preco_novo > 0
                      ? ((h.preco_novo - historicoServico.preco_custo) / h.preco_novo) * 100
                      : null;
                    return (
                      <div key={idx} className="bg-black/30 border border-white/5 rounded-2xl p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-xs font-bold">R$ {h.preco_anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} → <span className="text-white font-black">R$ {h.preco_novo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></span>
                          <span className="text-slate-500 text-[10px]">{new Date(h.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded uppercase ${subiu ? 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' : 'text-red-400 bg-red-500/10'}`}>
                            {subiu ? <TrendingUp size={9} /> : <TrendingDown size={9} />} {subiu ? '+' : ''}{variacao.toFixed(1)}%
                          </span>
                          {margemNoMomento != null && (
                            <span className="text-[9px] font-black bg-white/5 text-slate-400 px-2 py-0.5 rounded uppercase">margem com custo atual: {margemNoMomento.toFixed(0)}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-slate-600 text-[9px] font-bold pt-1">Margem calculada com o custo atual do produto (R$ {historicoServico.preco_custo?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '—'}) — o custo em si não tem histórico, só o preço de venda.</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {ajusteServico && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAjusteServico(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Pencil size={16} className="text-amber-400" /> Ajuste manual</h3>
              <button onClick={() => setAjusteServico(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
            </div>
            <p className="text-slate-400 text-xs font-bold mb-4">{ajusteServico.nome} — atual: {ajusteServico.estoque}</p>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {(['entrada', 'saida', 'definir'] as const).map(t => (
                <button key={t} onClick={() => { setAjusteTipo(t); setAjusteMotivoCat(t === 'saida' ? 'perda' : 'compra'); }} className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${ajusteTipo === t ? 'bg-amber-500 text-[#0B1120]' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                  {t === 'entrada' ? 'Entrada (+)' : t === 'saida' ? 'Saída (−)' : 'Definir valor'}
                </button>
              ))}
            </div>

            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
              {ajusteTipo === 'definir' ? 'Novo valor exato' : 'Quantidade'}
            </label>
            <input type="number" value={ajusteQtd} onChange={e => setAjusteQtd(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 mb-3" placeholder="0" autoFocus />

            {ajusteTipo !== 'definir' && (
              <>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Motivo</label>
                <select value={ajusteMotivoCat} onChange={e => setAjusteMotivoCat(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 mb-3">
                  {(ajusteTipo === 'entrada' ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA).map(m => (
                    <option key={m} value={m} className="bg-[#0B1120]">{MOTIVO_LABEL[m]}</option>
                  ))}
                </select>
              </>
            )}

            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Observação (opcional)</label>
            <input value={ajusteMotivo} onChange={e => setAjusteMotivo(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 mb-5" placeholder="Detalhe livre, se quiser" />

            <button onClick={confirmarAjuste} disabled={salvandoAjuste || !ajusteQtd}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B1120] font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2">
              {salvandoAjuste ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} Confirmar ajuste
            </button>
          </div>
        </div>
      )}

      <LancarNotaFiscalModal
        aberto={notaModalAberto}
        onFechar={() => setNotaModalAberto(false)}
        servicos={servicos}
        empresaId={perfil?.empresa_id}
        userId={user?.id}
        tipoInicial={notaTipo}
        onConcluido={() => fetchServicos()}
      />

      <VerNotaFiscalModal aberto={verNotaId != null} onFechar={() => setVerNotaId(null)} notaId={verNotaId} />
    </div>
  );
}
