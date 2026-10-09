"use client";
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Factory, Plus, Trash2, Hammer, CheckCircle2, PackageCheck, ClipboardList, Settings2, ShoppingBag, X, MessageSquare, Camera, ChevronRight, Tv, AlertTriangle, ListChecks, Square, CheckSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { comprimirImagem } from '@/lib/comprimirImagem';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig, FichaTecnicaItem, AditivoItem, PulseAditivo, aprovarAditivo, etapasFabricacaoDe, prazosEtapasFabricacaoDe, checklistsEtapasFabricacaoDe, type ChecklistFeito, ehMateriaPrima, ehUsoConsumo } from '../shared';

// "Load failed" (Safari) / "Failed to fetch" (Chrome) = a internet caiu no meio do envio.
function mensagemErroRede(err: any): string {
  const msg = String(err?.message || '');
  if (/load failed|failed to fetch|network/i.test(msg)) return 'a conexão caiu durante o envio. Confira a internet (Wi-Fi da fábrica) e tente de novo.';
  return msg || 'tente novamente';
}

type StatusProducao = 'em_producao' | 'concluida' | 'entregue';
type Producao = {
  id: number; produto_final_id: number | null; produto_final_nome: string; quantidade_produzida: number; custo_total: number; created_at: string;
  status: StatusProducao; previsao_entrega: string | null; responsavel_id: string | null; lead_id: number | null;
  etapa_fabricacao_idx: number;
  checklist_feito?: ChecklistFeito | null;
};
type EventoProducao = {
  id: number; tipo: 'status' | 'etapa' | 'comentario' | 'anexo'; texto: string | null; foto_url: string | null;
  user_id: string | null; created_at: string;
  // Foto só vai pro Portal do Cliente quando 'aprovada' pela gestão (null = aguardando).
  foto_status?: 'pendente' | 'aprovada' | 'recusada' | null;
};
type FotoPendente = { id: number; producao_id: number; foto_url: string; created_at: string; texto: string | null };

const COLUNAS: { status: StatusProducao; label: string; icon: any; cor: string }[] = [
  { status: 'em_producao', label: 'Em produção', icon: Hammer, cor: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { status: 'concluida', label: 'Concluída', icon: CheckCircle2, cor: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { status: 'entregue', label: 'Entregue', icon: PackageCheck, cor: 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)] border-[rgb(var(--cor-primaria-rgb)/20%)]' },
];
const PROXIMA_ETAPA: Record<StatusProducao, StatusProducao | null> = { em_producao: 'concluida', concluida: 'entregue', entregue: null };

// Produção nasce de 2 formas: automática (Nova Venda fecha um pedido de um produto que já
// tem ficha técnica cadastrada) ou manual aqui (produto sem venda associada, ex: repor
// estoque de um item que se vende pronto). As duas usam a MESMA ficha técnica — nunca mais
// se re-seleciona matéria-prima na hora, isso é cadastrado uma vez por produto.
function PulseProducaoContent() {
  const { authLoading, temPulse, user, perfil, empresa, isLideranca, usersMap } = usePulseAccess();
  const ETAPAS_FABRICACAO = useMemo(() => etapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);
  const CHECKLISTS = useMemo(() => checklistsEtapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);
  const PRAZOS_ETAPA = useMemo(() => prazosEtapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);
  const searchParams = useSearchParams();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [producoes, setProducoes] = useState<Producao[]>([]);
  const [fichas, setFichas] = useState<{ id: number; produto_final_id: number; servico_id: number; quantidade_por_unidade: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Última foto anexada de cada produção — mostrada em miniatura no card, pra dar pra
  // liderança acompanhar visualmente o andamento sem abrir o detalhe de cada uma.
  const [fotosPorProducao, setFotosPorProducao] = useState<Record<number, string>>({});
  // Quando a etapa atual começou (= data em que a etapa anterior foi concluída, ou o
  // início da produção se ainda está na primeira) — comparado com PRAZOS_ETAPA pra medir
  // produtividade direto no card.
  const [etapaIniciadaEmPorProducao, setEtapaIniciadaEmPorProducao] = useState<Record<number, string>>({});
  const [concluindoEtapaId, setConcluindoEtapaId] = useState<number | null>(null);

  // --- Ficha técnica ---
  const [abaFicha, setAbaFicha] = useState(false);
  const [fichaProdutoId, setFichaProdutoId] = useState<number | ''>('');
  const [fichaLinhas, setFichaLinhas] = useState<{ servicoId: number | ''; quantidade: string }[]>([{ servicoId: '', quantidade: '' }]);
  const [fichaPrazoDias, setFichaPrazoDias] = useState('');
  const [salvandoFicha, setSalvandoFicha] = useState(false);
  const [erroFicha, setErroFicha] = useState('');

  // --- Detalhe/linha do tempo por produção ---
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [eventos, setEventos] = useState<EventoProducao[]>([]);
  const [carregandoEventos, setCarregandoEventos] = useState(false);
  const [aditivos, setAditivos] = useState<PulseAditivo[]>([]);
  const [mostrarFormAditivo, setMostrarFormAditivo] = useState(false);
  const [aditivoItens, setAditivoItens] = useState<AditivoItem[]>([]);
  const [aditivoServicoId, setAditivoServicoId] = useState('');
  const [aditivoQtd, setAditivoQtd] = useState('1');
  const [aditivoMotivo, setAditivoMotivo] = useState('');
  const [enviandoAditivo, setEnviandoAditivo] = useState(false);
  const [processandoAditivoId, setProcessandoAditivoId] = useState<number | null>(null);
  const [novoComentario, setNovoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  // Cliente dono de cada produção (produção nasce de uma venda; o nome vem do lead)
  const [clientePorLead, setClientePorLead] = useState<Record<number, string>>({});
  // Fotos aguardando a gestão aprovar pro Portal do Cliente.
  const [fotosPendentes, setFotosPendentes] = useState<FotoPendente[]>([]);
  const [filaFotosAberta, setFilaFotosAberta] = useState(false);
  const [avaliandoFotos, setAvaliandoFotos] = useState<number[]>([]);

  const carregar = async () => {
    setLoading(true);
    const [{ data: servicosData }, { data: producoesData }, { data: fichasData }] = await Promise.all([
      supabase.from('servicos').select('*').order('nome', { ascending: true }),
      // '*' traz checklist_feito sem quebrar antes da migration rodar.
      supabase.from('pulse_producoes').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('pulse_fichas_tecnicas').select('id, produto_final_id, servico_id, quantidade_por_unidade'),
    ]);
    if (servicosData) setServicos(servicosData as ServicoConfig[]);
    if (producoesData) setProducoes(producoesData as Producao[]);
    if (fichasData) setFichas(fichasData);

    const leadIds = [...new Set((producoesData || []).map(p => p.lead_id).filter((x): x is number => !!x))];
    if (leadIds.length > 0) {
      const { data: leadsData } = await supabase.from('leads').select('id, empresa').in('id', leadIds);
      setClientePorLead(Object.fromEntries((leadsData || []).map((l: any) => [l.id, l.empresa])));
    } else setClientePorLead({});

    const ids = (producoesData || []).map(p => p.id);
    if (ids.length > 0) {
      // '*' traz foto_status sem quebrar antes da migration.
      const { data: fotos } = await supabase.from('pulse_producao_eventos')
        .select('*').in('producao_id', ids)
        .not('foto_url', 'is', null).order('created_at', { ascending: true });
      const mapa: Record<number, string> = {};
      // Ordenado crescente — a última sobrescreve as anteriores, então sobra sempre a mais recente.
      (fotos || []).forEach(f => { if (f.foto_url) mapa[f.producao_id] = f.foto_url; });
      setFotosPorProducao(mapa);
      setFotosPendentes((fotos || [])
        .filter(f => f.foto_url && (!f.foto_status || f.foto_status === 'pendente'))
        .map(f => ({ id: f.id, producao_id: f.producao_id, foto_url: f.foto_url, created_at: f.created_at, texto: f.texto }))
        .reverse());

      // Só eventos tipo "etapa" (conclusão de sub-etapa) — não usa o mesmo filtro de foto_url
      // acima porque anexo de comentário também tem foto_url e ia contar como troca de etapa.
      const { data: eventosEtapa } = await supabase.from('pulse_producao_eventos')
        .select('producao_id, created_at').in('producao_id', ids)
        .eq('tipo', 'etapa').order('created_at', { ascending: true });
      const mapaEtapa: Record<number, string> = {};
      (eventosEtapa || []).forEach(e => { mapaEtapa[e.producao_id] = e.created_at; });
      setEtapaIniciadaEmPorProducao(mapaEtapa);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  // Vem da Nova Venda pra abrir direto na ficha técnica de um produto que ainda não tem
  // composição cadastrada (venda bloqueada até configurar).
  useEffect(() => {
    const configurar = searchParams.get('configurarFicha');
    if (configurar) { setAbaFicha(true); setFichaProdutoId(Number(configurar)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const servicoPorId = useMemo(() => new Map(servicos.map(s => [s.id, s])), [servicos]);
  const fichasPorProduto = useMemo(() => {
    const m = new Map<number, FichaTecnicaItem[]>();
    for (const f of fichas) {
      const lista = m.get(f.produto_final_id) || [];
      lista.push({ servicoId: f.servico_id, quantidadePorUnidade: Number(f.quantidade_por_unidade) });
      m.set(f.produto_final_id, lista);
    }
    return m;
  }, [fichas]);

  const produtosFinaisDisponiveis = servicos.filter(s => !ehMateriaPrima(s) && !ehUsoConsumo(s));
  const materiaPrimaDisponivel = servicos.filter(s => ehMateriaPrima(s));

  // Contadores acima do quadro — só quantidade, sem nenhum valor (mesma regra do resto
  // da tela). Dá pra ver de cara o tamanho da fila sem contar card por coluna.
  const emProducaoCount = producoes.filter(p => p.status === 'em_producao').length;
  const aguardandoEntregaCount = producoes.filter(p => p.status === 'concluida').length;
  const atrasadasCount = producoes.filter(p => p.previsao_entrega && new Date(p.previsao_entrega) < new Date() && p.status !== 'entregue').length;

  // --- Ficha técnica: carregar/editar/salvar ---
  useEffect(() => {
    if (!fichaProdutoId) { setFichaLinhas([{ servicoId: '', quantidade: '' }]); setFichaPrazoDias(''); return; }
    const existentes = fichasPorProduto.get(fichaProdutoId as number) || [];
    setFichaLinhas(existentes.length > 0
      ? existentes.map(f => ({ servicoId: f.servicoId, quantidade: String(f.quantidadePorUnidade) }))
      : [{ servicoId: '', quantidade: '' }]);
    setFichaPrazoDias(String(servicoPorId.get(fichaProdutoId as number)?.prazo_fabricacao_dias ?? ''));
  }, [fichaProdutoId, fichasPorProduto, servicoPorId]);

  const adicionarLinhaFicha = () => setFichaLinhas(prev => [...prev, { servicoId: '', quantidade: '' }]);
  const removerLinhaFicha = (idx: number) => setFichaLinhas(prev => prev.filter((_, i) => i !== idx));
  const atualizarLinhaFicha = (idx: number, campo: 'servicoId' | 'quantidade', valor: any) =>
    setFichaLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));

  const salvarFicha = async () => {
    setErroFicha('');
    if (!fichaProdutoId) { setErroFicha('Selecione o produto.'); return; }
    const validas = fichaLinhas.filter(l => l.servicoId && Number(l.quantidade) > 0);
    if (validas.length === 0) { setErroFicha('Adicione ao menos uma matéria-prima com quantidade maior que zero.'); return; }
    setSalvandoFicha(true);
    try {
      await supabase.from('pulse_fichas_tecnicas').delete().eq('produto_final_id', fichaProdutoId);
      const payload = validas.map(l => ({
        empresa_id: perfil?.empresa_id, produto_final_id: fichaProdutoId,
        servico_id: l.servicoId, quantidade_por_unidade: Number(l.quantidade),
      }));
      const { error } = await supabase.from('pulse_fichas_tecnicas').insert(payload);
      if (error) throw error;
      await supabase.from('servicos').update({ prazo_fabricacao_dias: fichaPrazoDias ? Number(fichaPrazoDias) : null }).eq('id', fichaProdutoId);
      await carregar();
      setErroFicha('');
    } catch (err: any) {
      setErroFicha(err?.message || 'Erro ao salvar ficha técnica.');
    } finally {
      setSalvandoFicha(false);
    }
  };

  const avancarEtapa = async (p: Producao) => {
    const proxima = PROXIMA_ETAPA[p.status];
    if (!proxima) return;
    if (p.status === 'em_producao' && !etapaAtualCompleta(p)) {
      alert(`Finalize o checklist da etapa "${ETAPAS_FABRICACAO[p.etapa_fabricacao_idx]}" antes de marcar como concluída.`);
      return;
    }
    const proximaInfo = COLUNAS.find(c => c.status === proxima)!;
    setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, status: proxima } : x));
    const { error: errStatus } = await supabase.from('pulse_producoes').update({ status: proxima }).eq('id', p.id);
    if (errStatus) {
      setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, status: p.status } : x));
      alert('Não foi possível mudar a etapa: ' + mensagemErroRede(errStatus));
      return;
    }
    await supabase.from('pulse_producao_eventos').insert([{ producao_id: p.id, tipo: 'status', texto: `Movida para "${proximaInfo.label}".`, user_id: user?.id }]);
    if (detalheId === p.id) carregarEventos(p.id);

    // Entrega futura: NF2 (remessa, CFOP 5116/6116) só faz sentido no momento real da
    // entrega — dispara aqui, sem travar a mudança de coluna se a emissão falhar (dá pra
    // tentar de novo depois em /pulse/fiscal).
    if (proxima === 'entregue' && p.lead_id) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Sessão expirada.');
        const res = await fetch('/api/pulse/fiscal/emitir-nf2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ leadId: p.lead_id }),
        });
        const json = await res.json();
        if (!res.ok) alert(`Produção marcada como entregue, mas a NF de entrega não saiu: ${json.error || 'erro desconhecido'}. Pode tentar emitir manualmente em /pulse/fiscal.`);
      } catch (err: any) {
        alert(`Produção marcada como entregue, mas a NF de entrega não saiu: ${err?.message || 'erro desconhecido'}.`);
      }
    }
  };

  // --- Processo: checklist por etapa ---
  // Sub-etapa de fabricação (corte/solda/pintura/acabamento) — só faz sentido em "Em produção";
  // avançar até o fim não move de coluna sozinho, quem decide isso ainda é o botão "Marcar
  // Concluída". A etapa só conclui com o checklist dela completo (configurado em Configurações →
  // Etapas de Produção); a foto virou registro opcional — antes ela sozinha concluía a etapa.
  const [processoId, setProcessoId] = useState<number | null>(null);
  const [marcandoItem, setMarcandoItem] = useState<string | null>(null);
  const itensDaEtapa = (nome: string | undefined) => (nome ? CHECKLISTS[nome] || [] : []);
  const feitosDaEtapa = (p: Producao, nome: string | undefined) => {
    const marcados = (nome && p.checklist_feito?.[nome]) || {};
    return itensDaEtapa(nome).filter(i => marcados[i]).length;
  };
  const etapaAtualCompleta = (p: Producao) => {
    const nome = ETAPAS_FABRICACAO[p.etapa_fabricacao_idx];
    return feitosDaEtapa(p, nome) >= itensDaEtapa(nome).length;
  };

  const alternarItem = async (p: Producao, etapa: string, item: string) => {
    setMarcandoItem(`${p.id}|${etapa}|${item}`);
    try {
      // Lê o atual antes de gravar: duas pessoas marcando ao mesmo tempo não apagam o item do outro.
      const { data: atual, error: errLer } = await supabase.from('pulse_producoes').select('checklist_feito').eq('id', p.id).single();
      if (errLer) throw errLer;
      const mapa: ChecklistFeito = { ...((atual?.checklist_feito as ChecklistFeito) || {}) };
      const daEtapa = { ...(mapa[etapa] || {}) };
      if (daEtapa[item]) delete daEtapa[item];
      else daEtapa[item] = { por: user?.id || null, em: new Date().toISOString() };
      mapa[etapa] = daEtapa;
      const { error } = await supabase.from('pulse_producoes').update({ checklist_feito: mapa }).eq('id', p.id);
      if (error) throw error;
      setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, checklist_feito: mapa } : x));
    } catch (err: any) {
      const msg = String(err?.message || '');
      alert(/checklist_feito/.test(msg) ? 'Falta rodar a migration 20261009100000_producao_checklist.sql no Supabase.' : 'Erro ao marcar item: ' + mensagemErroRede(err));
    } finally {
      setMarcandoItem(null);
    }
  };

  const concluirEtapa = async (p: Producao, original?: File) => {
    if (p.etapa_fabricacao_idx >= ETAPAS_FABRICACAO.length - 1) return;
    if (!etapaAtualCompleta(p)) { alert('Finalize todos os itens do checklist antes de concluir a etapa.'); return; }
    setConcluindoEtapaId(p.id);
    try {
      let fotoUrl: string | null = null;
      if (original) {
        const file = await comprimirImagem(original);
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${perfil?.empresa_id}/producao-${p.id}-etapa-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('produtos').upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        fotoUrl = supabase.storage.from('produtos').getPublicUrl(path).data.publicUrl;
      }
      const novoIdx = p.etapa_fabricacao_idx + 1;
      const etapaConcluida = ETAPAS_FABRICACAO[p.etapa_fabricacao_idx];
      const totalItens = itensDaEtapa(etapaConcluida).length;
      // Só atualiza a tela depois de gravar (antes o erro era ignorado e a tela mentia).
      const { error: errEtapa } = await supabase.from('pulse_producoes').update({ etapa_fabricacao_idx: novoIdx }).eq('id', p.id);
      if (errEtapa) throw errEtapa;
      const { error: errEvento } = await supabase.from('pulse_producao_eventos').insert([{
        producao_id: p.id, tipo: 'etapa',
        texto: `Etapa concluída: ${etapaConcluida}.${totalItens ? ` Checklist ${totalItens}/${totalItens}.` : ''}`,
        foto_url: fotoUrl, user_id: user?.id,
      }]);
      if (errEvento) throw errEvento;
      setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, etapa_fabricacao_idx: novoIdx } : x));
      if (fotoUrl) setFotosPorProducao(prev => ({ ...prev, [p.id]: fotoUrl! }));
      setEtapaIniciadaEmPorProducao(prev => ({ ...prev, [p.id]: new Date().toISOString() }));
      if (detalheId === p.id) carregarEventos(p.id);
    } catch (err: any) {
      alert('Erro ao concluir etapa: ' + mensagemErroRede(err));
    } finally {
      setConcluindoEtapaId(null);
    }
  };

  const atualizarPrazo = async (p: Producao, valor: string) => {
    setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, previsao_entrega: valor || null } : x));
    await supabase.from('pulse_producoes').update({ previsao_entrega: valor || null }).eq('id', p.id);
  };

  const atualizarResponsavel = async (p: Producao, valor: string) => {
    setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, responsavel_id: valor || null } : x));
    await supabase.from('pulse_producoes').update({ responsavel_id: valor || null }).eq('id', p.id);
  };

  // --- Detalhe/linha do tempo ---
  const carregarEventos = async (producaoId: number) => {
    setCarregandoEventos(true);
    const { data } = await supabase.from('pulse_producao_eventos').select('*').eq('producao_id', producaoId).order('created_at', { ascending: true });
    setEventos((data as EventoProducao[]) || []);
    setCarregandoEventos(false);
  };

  const carregarAditivos = async (producaoId: number) => {
    const { data } = await supabase.from('pulse_aditivos').select('*').eq('producao_id', producaoId).order('created_at', { ascending: false });
    setAditivos((data as PulseAditivo[]) || []);
  };

  const abrirDetalhe = (p: Producao) => {
    setDetalheId(p.id); setNovoComentario(''); carregarEventos(p.id); carregarAditivos(p.id);
    setMostrarFormAditivo(false); setAditivoItens([]); setAditivoMotivo('');
  };
  const fecharDetalhe = () => { setDetalheId(null); setEventos([]); setAditivos([]); };

  const adicionarItemAditivo = () => {
    const s = servicos.find(sv => sv.id === Number(aditivoServicoId));
    const qtd = Number(aditivoQtd);
    if (!s || !qtd || qtd <= 0) return;
    setAditivoItens(prev => [...prev, { servicoId: s.id, nome: s.nome, quantidade: qtd, precoUnitario: s.preco }]);
    setAditivoServicoId(''); setAditivoQtd('1');
  };
  const removerItemAditivo = (idx: number) => setAditivoItens(prev => prev.filter((_, i) => i !== idx));
  const valorAditivo = aditivoItens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);

  const enviarAditivo = async () => {
    if (!detalheProducao || aditivoItens.length === 0) return;
    setEnviandoAditivo(true);
    try {
      const { error } = await supabase.from('pulse_aditivos').insert([{
        empresa_id: perfil?.empresa_id, producao_id: detalheProducao.id, lead_id: detalheProducao.lead_id,
        itens: aditivoItens, valor_adicional: valorAditivo, motivo: aditivoMotivo.trim() || null,
        solicitado_por: user?.id,
      }]);
      if (error) throw error;
      await supabase.from('pulse_producao_eventos').insert([{
        producao_id: detalheProducao.id, tipo: 'comentario', user_id: user?.id,
        texto: `Aditivo solicitado (aguardando aprovação): ${aditivoItens.map(i => `${i.nome} ×${i.quantidade}`).join(', ')} — R$ ${valorAditivo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
      }]);
      setMostrarFormAditivo(false); setAditivoItens([]); setAditivoMotivo('');
      carregarAditivos(detalheProducao.id); carregarEventos(detalheProducao.id);
    } catch (err: any) {
      alert('Erro ao solicitar aditivo: ' + (err?.message || 'tente novamente'));
    } finally {
      setEnviandoAditivo(false);
    }
  };

  const decidirAditivo = async (aditivo: PulseAditivo, aprovar: boolean) => {
    setProcessandoAditivoId(aditivo.id);
    try {
      if (aprovar) {
        await aprovarAditivo(aditivo, perfil?.empresa_id || '', user?.id);
      } else {
        await supabase.from('pulse_aditivos').update({ status: 'rejeitado', aprovado_por: user?.id, aprovado_em: new Date().toISOString() }).eq('id', aditivo.id);
      }
      if (detalheId) { carregarAditivos(detalheId); carregarEventos(detalheId); carregar(); }
    } catch (err: any) {
      alert('Erro ao processar aditivo: ' + (err?.message || 'tente novamente'));
    } finally {
      setProcessandoAditivoId(null);
    }
  };

  const adicionarComentario = async () => {
    if (!detalheId || !novoComentario.trim()) return;
    setEnviandoComentario(true);
    const { error } = await supabase.from('pulse_producao_eventos').insert([{ producao_id: detalheId, tipo: 'comentario', texto: novoComentario.trim(), user_id: user?.id }]);
    if (!error) { setNovoComentario(''); carregarEventos(detalheId); }
    setEnviandoComentario(false);
  };

  const enviarFoto = async (original: File) => {
    if (!detalheId) return;
    setEnviandoFoto(true);
    try {
      const file = await comprimirImagem(original);
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${perfil?.empresa_id}/producao-${detalheId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('produtos').upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(path);
      const { error: errAnexo } = await supabase.from('pulse_producao_eventos').insert([{ producao_id: detalheId, tipo: 'anexo', foto_url: urlData.publicUrl, user_id: user?.id }]);
      if (errAnexo) throw errAnexo;
      carregarEventos(detalheId);
    } catch (err: any) {
      alert('Erro ao subir foto: ' + mensagemErroRede(err));
    } finally {
      setEnviandoFoto(false);
    }
  };

  const avaliarFotos = async (eventoIds: number[], status: 'aprovada' | 'recusada' | 'pendente') => {
    if (eventoIds.length === 0) return;
    setAvaliandoFotos(eventoIds);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/pulse/producao/foto-aprovacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ eventoIds, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const ids = new Set(eventoIds);
      setFotosPendentes(prev => status === 'pendente' ? prev : prev.filter(f => !ids.has(f.id)));
      setEventos(prev => prev.map(ev => ids.has(ev.id) ? { ...ev, foto_status: status } : ev));
      if (status === 'pendente') carregar();
    } catch (err: any) {
      alert('Erro ao avaliar foto: ' + mensagemErroRede(err));
    } finally {
      setAvaliandoFotos([]);
    }
  };

  const detalheProducao = producoes.find(p => p.id === detalheId) || null;
  const processoProducao = producoes.find(p => p.id === processoId) || null;

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Factory size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="md:p-8 pb-20 text-white">
      <header className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-2 md:gap-3">
            <Factory className="w-6 h-6 md:w-8 md:h-8 shrink-0" /> Produção
          </h1>
          <p className="hidden md:block text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Produção nasce sozinha na venda — acompanhe etapas e prazos aqui</p>
        </div>
        {isLideranca && (
          <div className="flex flex-wrap gap-2 self-start md:self-auto">
            <button onClick={() => setFilaFotosAberta(true)} title="Fotos aguardando aprovação pra aparecer no Portal do Cliente" className={`inline-flex items-center gap-2 border px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${fotosPendentes.length ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25' : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'}`}>
              <Camera size={14} /> Fotos p/ cliente{fotosPendentes.length ? ` (${fotosPendentes.length})` : ''}
            </button>
            <Link href="/pulse/producao/painel" target="_blank" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
              <Tv size={14} /> Painel de TV
            </Link>
            <button onClick={() => setAbaFicha(v => !v)} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
              <Settings2 size={14} /> Ficha técnica
            </button>
          </div>
        )}
      </header>

      {/* Ficha técnica e registro manual são configuração/planejamento — só liderança
          precisa disso. Time de produção vê só o quadro, limpo e direto: qual etapa,
          concluir com foto, próximo. */}
      {isLideranca && abaFicha && (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5 mb-6">
          <p className="text-sm font-black uppercase text-slate-300 mb-1">Ficha técnica por produto</p>
          <p className="text-slate-500 text-[11px] font-bold mb-4">Cadastre quanto de cada matéria-prima 1 unidade do produto consome — opcional: sem ficha técnica, a produção acontece do mesmo jeito, só não baixa matéria-prima sozinha.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Produto</label>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {produtosFinaisDisponiveis.map(s => {
                  const temFicha = (fichasPorProduto.get(s.id) || []).length > 0;
                  return (
                    <button key={s.id} onClick={() => setFichaProdutoId(s.id)}
                      className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 rounded-xl border transition-all ${fichaProdutoId === s.id ? 'bg-[rgb(var(--cor-primaria-rgb)/10%)] border-[var(--cor-primaria)]' : 'bg-black/20 border-white/5 hover:border-white/20'}`}>
                      <span className="text-white text-xs font-bold truncate">{s.nome}</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${temFicha ? 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' : 'text-amber-400 bg-amber-500/10'}`}>
                        {temFicha ? 'Configurada' : 'Pendente'}
                      </span>
                    </button>
                  );
                })}
                {produtosFinaisDisponiveis.length === 0 && <p className="text-slate-500 text-xs font-bold py-4 text-center">Cadastre produtos em Estoque primeiro.</p>}
              </div>
            </div>

            <div>
              {!fichaProdutoId ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs font-bold py-10">Selecione um produto ao lado.</div>
              ) : (
                <>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Composição (por 1 unidade)</label>
                  <div className="space-y-2 mb-3">
                    {fichaLinhas.map((linha, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select value={linha.servicoId} onChange={e => atualizarLinhaFicha(idx, 'servicoId', e.target.value ? Number(e.target.value) : '')}
                          className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--cor-primaria)]">
                          <option value="">Matéria-prima...</option>
                          {materiaPrimaDisponivel.map(s => <option key={s.id} value={s.id}>{s.nome}{s.unidade ? ` (${s.unidade})` : ''}</option>)}
                        </select>
                        <input type="number" value={linha.quantidade} onChange={e => atualizarLinhaFicha(idx, 'quantidade', e.target.value)}
                          className="w-20 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--cor-primaria)]" placeholder="Qtd" />
                        <button onClick={() => removerLinhaFicha(idx)} className="text-slate-500 hover:text-red-400 flex-shrink-0"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={adicionarLinhaFicha} className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--cor-primaria)] mb-4">
                    <Plus size={13} /> Adicionar matéria-prima
                  </button>
                  <div className="mb-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Prazo padrão de fabricação (dias)</label>
                    <input type="number" min="0" value={fichaPrazoDias} onChange={e => setFichaPrazoDias(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--cor-primaria)]" placeholder="Ex: 7" />
                    <p className="text-slate-600 text-[10px] font-bold mt-1">Preenche a previsão de entrega sozinho quando a produção nasce de uma venda.</p>
                  </div>
                  {erroFicha && <p className="text-[12px] text-red-400 font-bold mb-3">{erroFicha}</p>}
                  <button onClick={salvarFicha} disabled={salvandoFicha}
                    className="w-full bg-[var(--cor-primaria)] hover:bg-[#1ea34d] disabled:opacity-50 text-[#0B1120] py-2.5 rounded-xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    {salvandoFicha ? <Loader2 size={16} className="animate-spin" /> : 'Salvar ficha técnica'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Hammer size={10} /> Em produção</p>
          <p className="text-2xl font-black text-white mt-1">{emProducaoCount}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10} /> Aguardando entrega</p>
          <p className="text-2xl font-black text-white mt-1">{aguardandoEntregaCount}</p>
        </div>
        <div className={`bg-[#0F172A] border rounded-2xl p-4 ${atrasadasCount > 0 ? 'border-red-500/40' : 'border-white/10'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${atrasadasCount > 0 ? 'text-red-400' : 'text-slate-500'}`}><AlertTriangle size={10} /> Atrasadas</p>
          <p className={`text-2xl font-black mt-1 ${atrasadasCount > 0 ? 'text-red-400' : 'text-white'}`}>{atrasadasCount}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={15} className="text-slate-500" />
        <h3 className="font-black uppercase text-sm text-slate-300">Fluxo de produção</h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUNAS.map(col => {
            const itens = producoes.filter(p => p.status === col.status);
            const Icon = col.icon;
            return (
              <div key={col.status} className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden flex flex-col">
                <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${col.cor}`}>
                  <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest"><Icon size={13} /> {col.label}</span>
                  <span className="text-[11px] font-black">{itens.length}</span>
                </div>
                <div className="p-3 space-y-2 flex-1 min-h-[80px]">
                  {itens.length === 0 && <p className="text-slate-600 text-[11px] font-bold text-center py-6">Nada aqui.</p>}
                  {itens.map(p => {
                    const proxima = PROXIMA_ETAPA[p.status];
                    const proximaInfo = proxima ? COLUNAS.find(c => c.status === proxima) : null;
                    const atrasada = p.previsao_entrega && new Date(p.previsao_entrega) < new Date() && p.status !== 'entregue';
                    // Foto de progresso (anexada ao concluir etapa) tem prioridade — quando
                    // ainda não tem nenhuma, cai pra foto do produto cadastrada no catálogo.
                    const fotoCard = fotosPorProducao[p.id] || servicoPorId.get(p.produto_final_id ?? -1)?.imagem_url || null;
                    return (
                      <div key={p.id} className="bg-white/[0.02] border border-white/5 rounded-2xl p-3">
                        <button onClick={() => abrirDetalhe(p)} className="w-full text-left flex items-center gap-2">
                          {fotoCard && <img src={fotoCard} alt="" className="w-9 h-9 rounded-lg object-cover border border-white/10 flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black uppercase tracking-wide text-[var(--cor-primaria)] truncate" title={p.lead_id ? clientePorLead[p.lead_id] : undefined}>
                              {p.lead_id ? (clientePorLead[p.lead_id] || `Venda LD-${String(p.lead_id).padStart(4, '0')}`) : 'Sem cliente (produção manual)'}
                            </p>
                            <p className="text-white font-bold text-sm truncate hover:underline">{p.produto_final_nome} <span className="text-slate-500 font-semibold">× {p.quantidade_produzida}</span></p>
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {p.lead_id && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                              <ShoppingBag size={9} /> Venda
                            </span>
                          )}
                          <span className="text-[9px] text-slate-500 font-bold">{new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                        </div>

                        {p.status === 'em_producao' && (
                          <div className="flex items-center gap-1 mt-2.5">
                            {ETAPAS_FABRICACAO.map((et, idx) => (
                              <div key={et} title={et} className={`h-1.5 flex-1 rounded-full ${idx <= p.etapa_fabricacao_idx ? 'bg-amber-400' : 'bg-white/10'}`} />
                            ))}
                          </div>
                        )}
                        {p.status === 'em_producao' && (() => {
                          const nomeEtapaAtual = ETAPAS_FABRICACAO[p.etapa_fabricacao_idx];
                          const prazoEtapa = PRAZOS_ETAPA[nomeEtapaAtual];
                          const inicioEtapa = etapaIniciadaEmPorProducao[p.id] || p.created_at;
                          const diasNaEtapa = Math.floor((Date.now() - new Date(inicioEtapa).getTime()) / 86400000);
                          return (
                          <div className="flex items-center justify-between mt-1.5 gap-1.5">
                            <span className="text-[9px] text-slate-500 font-bold truncate">{nomeEtapaAtual}</span>
                            {prazoEtapa != null && (
                              <span
                                title={`${diasNaEtapa} dia(s) nessa etapa — prazo configurado: ${prazoEtapa} dia(s)`}
                                className={`text-[9px] font-black uppercase flex-shrink-0 ${diasNaEtapa > prazoEtapa ? 'text-red-400' : 'text-emerald-400'}`}
                              >
                                {diasNaEtapa}d / {prazoEtapa}d
                              </span>
                            )}
                            {(() => {
                              const total = itensDaEtapa(nomeEtapaAtual).length;
                              const feitos = feitosDaEtapa(p, nomeEtapaAtual);
                              return (
                                <button onClick={() => setProcessoId(p.id)} title="Processo: checklist da etapa" className={`flex items-center gap-1 text-[9px] font-black uppercase flex-shrink-0 px-1.5 py-0.5 rounded-md border ${total && feitos >= total ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'}`}>
                                  {concluindoEtapaId === p.id ? <Loader2 size={11} className="animate-spin" /> : <ListChecks size={11} />}
                                  {total ? `${feitos}/${total}` : 'Processo'}
                                </button>
                              );
                            })()}
                          </div>
                          );
                        })()}
                        {fotosPorProducao[p.id] && (
                          <img src={fotosPorProducao[p.id]} alt="" className="mt-2 rounded-lg w-full h-20 object-cover border border-white/10" />
                        )}

                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          <input type="date" value={p.previsao_entrega || ''} onChange={e => atualizarPrazo(p, e.target.value)}
                            className={`bg-black/30 border rounded-lg px-2 py-1 text-[10px] outline-none focus:border-[var(--cor-primaria)] ${atrasada ? 'border-red-500/40 text-red-400' : 'border-white/10 text-slate-300'}`} />
                          {isLideranca && Object.keys(usersMap).length > 0 ? (
                            <select value={p.responsavel_id || ''} onChange={e => atualizarResponsavel(p, e.target.value)}
                              className="bg-black/30 border border-white/10 rounded-lg px-1.5 py-1 text-[10px] text-slate-300 outline-none focus:border-[var(--cor-primaria)]">
                              <option value="">Sem resp.</option>
                              {Object.entries(usersMap).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                            </select>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-bold truncate self-center">{p.responsavel_id && usersMap[p.responsavel_id] ? usersMap[p.responsavel_id] : '—'}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-end mt-2.5 pt-2.5 border-t border-white/5">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => abrirDetalhe(p)} className="flex items-center gap-1 text-slate-500 hover:text-white text-[9px] font-black uppercase">
                              <MessageSquare size={11} /> Detalhes
                            </button>
                            {proximaInfo && (
                              <button onClick={() => avancarEtapa(p)} className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-[9px] font-black text-slate-300 hover:text-white uppercase tracking-widest transition-all">
                                Marcar {proximaInfo.label}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filaFotosAberta && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setFilaFotosAberta(false)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-5 border-b border-white/5 flex-shrink-0">
              <div>
                <p className="text-white font-black text-sm uppercase">Fotos para o cliente</p>
                <p className="text-slate-500 text-[10px] font-bold">Só as aprovadas aparecem no Portal do Cliente. {fotosPendentes.length} aguardando.</p>
              </div>
              <div className="flex items-center gap-2">
                {fotosPendentes.length > 1 && (
                  <button onClick={() => avaliarFotos(fotosPendentes.map(f => f.id), 'aprovada')} disabled={avaliandoFotos.length > 0} className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg px-3 py-1.5 hover:bg-emerald-500/25 disabled:opacity-50">Aprovar todas</button>
                )}
                <button onClick={() => setFilaFotosAberta(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {fotosPendentes.length === 0 ? (
                <p className="text-slate-500 text-xs font-bold text-center py-10">Nenhuma foto aguardando aprovação.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {fotosPendentes.map(f => {
                    const prod = producoes.find(x => x.id === f.producao_id);
                    const cliente = prod?.lead_id ? (clientePorLead[prod.lead_id] || `LD-${String(prod.lead_id).padStart(4, '0')}`) : 'Produção manual';
                    const ocupado = avaliandoFotos.includes(f.id);
                    return (
                      <div key={f.id} className="bg-black/30 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                        <a href={f.foto_url} target="_blank" rel="noopener noreferrer"><img src={f.foto_url} alt="" className="w-full h-36 object-cover" /></a>
                        <div className="p-2.5 flex-1 flex flex-col gap-1">
                          <p className="text-[10px] font-black uppercase text-[var(--cor-primaria)] truncate">{cliente}</p>
                          <p className="text-[10px] text-slate-400 truncate">{prod?.produto_final_nome || '—'}</p>
                          {f.texto && <p className="text-[10px] text-slate-500 truncate" title={f.texto}>{f.texto}</p>}
                          <p className="text-[9px] text-slate-600">{new Date(f.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                          <div className="grid grid-cols-2 gap-1.5 mt-auto pt-1">
                            <button onClick={() => avaliarFotos([f.id], 'aprovada')} disabled={ocupado} className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg py-1.5 text-[9px] font-black uppercase disabled:opacity-50">{ocupado ? '...' : 'Aprovar'}</button>
                            <button onClick={() => avaliarFotos([f.id], 'recusada')} disabled={ocupado} className="bg-white/5 text-slate-400 border border-white/10 rounded-lg py-1.5 text-[9px] font-black uppercase hover:text-red-400 disabled:opacity-50">Recusar</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {processoProducao && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setProcessoId(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-5 border-b border-white/5 flex-shrink-0">
              <div className="min-w-0">
                <p className="text-amber-400 font-black text-xs uppercase tracking-wide flex items-center gap-1.5"><ListChecks size={13} /> Processo</p>
                <p className="text-white font-black text-sm truncate">{processoProducao.produto_final_nome} <span className="text-slate-500 font-semibold">× {processoProducao.quantidade_produzida}</span></p>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-0.5 truncate">{processoProducao.lead_id ? (clientePorLead[processoProducao.lead_id] || `Venda LD-${String(processoProducao.lead_id).padStart(4, '0')}`) : 'Sem cliente (produção manual)'}</p>
              </div>
              <button onClick={() => setProcessoId(null)} className="text-slate-500 hover:text-white flex-shrink-0"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {ETAPAS_FABRICACAO.map((etapa, idx) => {
                const p = processoProducao;
                const emProducao = p.status === 'em_producao';
                const concluida = !emProducao || idx < p.etapa_fabricacao_idx;
                const atual = emProducao && idx === p.etapa_fabricacao_idx;
                const itens = itensDaEtapa(etapa);
                const marcados = p.checklist_feito?.[etapa] || {};
                const completa = itens.every(i => marcados[i]);
                const ultima = idx === ETAPAS_FABRICACAO.length - 1;
                return (
                  <div key={etapa} className={`rounded-2xl border p-3.5 ${atual ? 'border-amber-500/40 bg-amber-500/[0.04]' : concluida ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-white/5 bg-white/[0.02] opacity-60'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-black uppercase tracking-wide flex items-center gap-1.5 ${atual ? 'text-amber-300' : concluida ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {concluida ? <CheckCircle2 size={13} /> : <span className="w-[13px] text-center text-[10px]">{idx + 1}</span>} {etapa}
                      </p>
                      {itens.length > 0 && <span className="text-[10px] font-black text-slate-500">{itens.filter(i => marcados[i]).length}/{itens.length}</span>}
                    </div>
                    {itens.length > 0 && (
                      <div className="mt-2.5 space-y-1">
                        {itens.map(item => {
                          const feito = !!marcados[item];
                          const chave = `${p.id}|${etapa}|${item}`;
                          return (
                            <button key={item} disabled={!atual || marcandoItem === chave} onClick={() => alternarItem(p, etapa, item)}
                              className={`w-full flex items-start gap-2 text-left text-xs rounded-lg px-2 py-1.5 ${atual ? 'hover:bg-white/5' : ''} ${feito ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                              {marcandoItem === chave ? <Loader2 size={14} className="animate-spin flex-shrink-0 mt-px" /> : feito ? <CheckSquare size={14} className="text-emerald-400 flex-shrink-0 mt-px" /> : <Square size={14} className="text-slate-500 flex-shrink-0 mt-px" />}
                              <span>{item}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {atual && !ultima && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => concluirEtapa(p)} disabled={!completa || concluindoEtapaId === p.id}
                          className="flex-1 bg-amber-500 hover:bg-amber-400 text-[#0B1120] py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1.5">
                          {concluindoEtapaId === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Concluir etapa
                        </button>
                        <label className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${completa ? 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10 cursor-pointer' : 'border-white/10 text-slate-600 cursor-not-allowed'}`} title="Concluir anexando uma foto (opcional)">
                          <Camera size={12} /> + foto
                          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!completa || concluindoEtapaId === p.id}
                            onChange={e => { const f = e.target.files?.[0]; if (f) concluirEtapa(p, f); e.target.value = ''; }} />
                        </label>
                      </div>
                    )}
                    {atual && !completa && <p className="text-[10px] text-amber-400/80 font-bold mt-2">Marque todos os itens para liberar a conclusão da etapa.</p>}
                    {atual && ultima && completa && <p className="text-[10px] text-emerald-400 font-bold mt-2">Última etapa completa — pode usar &quot;Marcar Concluída&quot; no card.</p>}
                  </div>
                );
              })}
              {Object.keys(CHECKLISTS).length === 0 && isLideranca && (
                <p className="text-[11px] text-slate-500 text-center">Nenhum checklist configurado. Configure em <Link href="/settings" className="text-amber-400 hover:underline">Configurações → Etapas de Produção</Link>.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {detalheProducao && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={fecharDetalhe}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-5 border-b border-white/5 flex-shrink-0">
              <div className="min-w-0">
                <p className="text-[var(--cor-primaria)] font-black text-xs uppercase tracking-wide truncate">{detalheProducao.lead_id ? (clientePorLead[detalheProducao.lead_id] || `Venda LD-${String(detalheProducao.lead_id).padStart(4, '0')}`) : 'Sem cliente (produção manual)'}</p>
                <p className="text-white font-black text-sm truncate">{detalheProducao.produto_final_nome} <span className="text-slate-500 font-semibold">× {detalheProducao.quantidade_produzida}</span></p>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-0.5">{COLUNAS.find(c => c.status === detalheProducao.status)?.label}</p>
              </div>
              <button onClick={fecharDetalhe} className="text-slate-500 hover:text-white flex-shrink-0"><X size={18} /></button>
            </div>

            {detalheProducao.status === 'em_producao' && (
              <div className="px-5 py-3 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  {ETAPAS_FABRICACAO.map((et, idx) => (
                    <div key={et} className="flex-1 text-center">
                      <div className={`h-1.5 rounded-full mb-1 ${idx <= detalheProducao.etapa_fabricacao_idx ? 'bg-amber-400' : 'bg-white/10'}`} />
                      <span className={`text-[8px] font-black uppercase ${idx <= detalheProducao.etapa_fabricacao_idx ? 'text-amber-400' : 'text-slate-600'}`}>{et}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(aditivos.length > 0 || detalheProducao.status !== 'entregue') && (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aditivos</p>
                    {detalheProducao.status !== 'entregue' && !mostrarFormAditivo && (
                      <button onClick={() => setMostrarFormAditivo(true)} className="text-[10px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-widest">+ Solicitar aditivo</button>
                    )}
                  </div>

                  {aditivos.map(ad => (
                    <div key={ad.id} className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${ad.status === 'aprovado' ? 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' : ad.status === 'rejeitado' ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10'}`}>{ad.status}</span>
                        <span className="text-white font-black text-xs">+R$ {ad.valor_adicional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <p className="text-slate-300 text-xs">{ad.itens.map(i => `${i.nome} ×${i.quantidade}`).join(', ')}</p>
                      {ad.motivo && <p className="text-slate-500 text-[10px] italic">{ad.motivo}</p>}
                      {ad.status === 'pendente' && isLideranca && (
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => decidirAditivo(ad, true)} disabled={processandoAditivoId === ad.id} className="flex-1 bg-[var(--cor-primaria)] text-[#0B1120] py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                            {processandoAditivoId === ad.id ? 'Processando...' : 'Aprovar'}
                          </button>
                          <button onClick={() => decidirAditivo(ad, false)} disabled={processandoAditivoId === ad.id} className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                            Rejeitar
                          </button>
                        </div>
                      )}
                      {ad.status === 'pendente' && !isLideranca && (
                        <p className="text-slate-600 text-[10px]">Aguardando aprovação da diretoria.</p>
                      )}
                    </div>
                  ))}

                  {mostrarFormAditivo && (
                    <div className="bg-black/30 border border-amber-500/20 rounded-xl p-3 space-y-2">
                      <div className="flex gap-2">
                        <select value={aditivoServicoId} onChange={e => setAditivoServicoId(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-white text-xs outline-none focus:border-amber-500">
                          <option value="" className="bg-[#0B1120]">Selecione o item...</option>
                          {servicos.map(s => <option key={s.id} value={s.id} className="bg-[#0B1120]">{s.nome} — R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</option>)}
                        </select>
                        <input type="number" min="1" value={aditivoQtd} onChange={e => setAditivoQtd(e.target.value)} className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-white text-xs text-center outline-none focus:border-amber-500" />
                        <button onClick={adicionarItemAditivo} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 rounded-lg"><Plus size={14} /></button>
                      </div>

                      {aditivoItens.length > 0 && (
                        <div className="space-y-1">
                          {aditivoItens.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-300">{it.nome} ×{it.quantidade}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-mono">R$ {(it.quantidade * it.precoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <button onClick={() => removerItemAditivo(idx)} className="text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <input value={aditivoMotivo} onChange={e => setAditivoMotivo(e.target.value)} placeholder="Motivo (opcional) — ex: cliente pediu depois de fechar" className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500" />

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-white font-black text-sm">Total: R$ {valorAditivo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <div className="flex gap-2">
                          <button onClick={() => { setMostrarFormAditivo(false); setAditivoItens([]); }} className="text-slate-400 hover:text-white text-[10px] font-black uppercase px-3 py-2">Cancelar</button>
                          <button onClick={enviarAditivo} disabled={enviandoAditivo || aditivoItens.length === 0} className="bg-amber-500 hover:bg-amber-400 text-[#0B1120] px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
                            {enviandoAditivo ? <Loader2 size={12} className="animate-spin" /> : null} Enviar pra aprovação
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {carregandoEventos ? (
                <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
              ) : eventos.length === 0 ? (
                <p className="text-slate-500 text-xs font-bold text-center py-8">Nenhum evento ainda.</p>
              ) : (
                eventos.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {ev.tipo === 'comentario' ? <MessageSquare size={11} className="text-slate-400" /> : ev.tipo === 'anexo' ? <Camera size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {ev.texto && <p className="text-slate-300 text-xs">{ev.texto}</p>}
                      {ev.foto_url && <img src={ev.foto_url} alt="" className="mt-1.5 rounded-xl max-h-48 w-full object-cover border border-white/10" />}
                      {ev.foto_url && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${ev.foto_status === 'aprovada' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : ev.foto_status === 'recusada' ? 'text-slate-500 border-white/10 bg-white/5' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
                            {ev.foto_status === 'aprovada' ? 'Visível ao cliente' : ev.foto_status === 'recusada' ? 'Não vai pro cliente' : 'Aguardando aprovação'}
                          </span>
                          {isLideranca && ev.foto_status !== 'aprovada' && (
                            <button onClick={() => avaliarFotos([ev.id], 'aprovada')} disabled={avaliandoFotos.includes(ev.id)} className="text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 disabled:opacity-50">Aprovar p/ cliente</button>
                          )}
                          {isLideranca && ev.foto_status !== 'recusada' && (
                            <button onClick={() => avaliarFotos([ev.id], 'recusada')} disabled={avaliandoFotos.includes(ev.id)} className="text-[9px] font-black uppercase text-slate-500 hover:text-red-400 disabled:opacity-50">{ev.foto_status === 'aprovada' ? 'Tirar do portal' : 'Recusar'}</button>
                          )}
                        </div>
                      )}
                      <p className="text-slate-600 text-[10px] font-bold mt-0.5">
                        {(ev.user_id && usersMap[ev.user_id]) || 'Sistema'} · {new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t border-white/5 flex-shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <input value={novoComentario} onChange={e => setNovoComentario(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarComentario()}
                  placeholder="Escreva um comentário..." className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--cor-primaria)]" />
                <button onClick={adicionarComentario} disabled={enviandoComentario || !novoComentario.trim()} className="bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-white px-3 py-2 rounded-xl flex-shrink-0">
                  {enviandoComentario ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
                </button>
                <label className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-2 rounded-xl flex-shrink-0 cursor-pointer">
                  {enviandoFoto ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                  <input type="file" accept="image/*" className="hidden" disabled={enviandoFoto} onChange={e => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PulseProducaoPage() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>}>
      <PulseProducaoContent />
    </Suspense>
  );
}
