"use client";
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Factory, Plus, Trash2, Hammer, CheckCircle2, PackageCheck, ClipboardList, Settings2, ShoppingBag, X, MessageSquare, Camera, ChevronRight, Tv, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig, FichaTecnicaItem, AditivoItem, PulseAditivo, aprovarAditivo, etapasFabricacaoDe, prazosEtapasFabricacaoDe, ehMateriaPrima } from '../shared';

type StatusProducao = 'em_producao' | 'concluida' | 'entregue';
type Producao = {
  id: number; produto_final_id: number | null; produto_final_nome: string; quantidade_produzida: number; custo_total: number; created_at: string;
  status: StatusProducao; previsao_entrega: string | null; responsavel_id: string | null; lead_id: number | null;
  etapa_fabricacao_idx: number;
};
type EventoProducao = {
  id: number; tipo: 'status' | 'etapa' | 'comentario' | 'anexo'; texto: string | null; foto_url: string | null;
  user_id: string | null; created_at: string;
};

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

  const carregar = async () => {
    setLoading(true);
    const [{ data: servicosData }, { data: producoesData }, { data: fichasData }] = await Promise.all([
      supabase.from('servicos').select('*').order('nome', { ascending: true }),
      supabase.from('pulse_producoes').select('id, produto_final_id, produto_final_nome, quantidade_produzida, custo_total, created_at, status, previsao_entrega, responsavel_id, lead_id, etapa_fabricacao_idx').order('created_at', { ascending: false }).limit(60),
      supabase.from('pulse_fichas_tecnicas').select('id, produto_final_id, servico_id, quantidade_por_unidade'),
    ]);
    if (servicosData) setServicos(servicosData as ServicoConfig[]);
    if (producoesData) setProducoes(producoesData as Producao[]);
    if (fichasData) setFichas(fichasData);

    const ids = (producoesData || []).map(p => p.id);
    if (ids.length > 0) {
      const { data: fotos } = await supabase.from('pulse_producao_eventos')
        .select('producao_id, foto_url, created_at').in('producao_id', ids)
        .not('foto_url', 'is', null).order('created_at', { ascending: true });
      const mapa: Record<number, string> = {};
      // Ordenado crescente — a última sobrescreve as anteriores, então sobra sempre a mais recente.
      (fotos || []).forEach(f => { if (f.foto_url) mapa[f.producao_id] = f.foto_url; });
      setFotosPorProducao(mapa);

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

  const produtosFinaisDisponiveis = servicos.filter(s => !ehMateriaPrima(s));
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
    const proximaInfo = COLUNAS.find(c => c.status === proxima)!;
    setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, status: proxima } : x));
    await supabase.from('pulse_producoes').update({ status: proxima }).eq('id', p.id);
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

  // Sub-etapa de fabricação (corte/solda/pintura/acabamento) — só faz sentido em "Em
  // produção"; avançar até o fim não move de coluna sozinho, quem decide isso ainda é o
  // botão "Marcar Concluída" acima. Exige foto pra concluir — LEAN: cada etapa fecha com
  // registro visual de verdade, não só um clique; dá pra liderança acompanhar pelo card
  // sem precisar perguntar pro time como está indo.
  const concluirEtapaComFoto = async (p: Producao, file: File) => {
    if (p.etapa_fabricacao_idx >= ETAPAS_FABRICACAO.length - 1) return;
    setConcluindoEtapaId(p.id);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${perfil?.empresa_id}/producao-${p.id}-etapa-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('produtos').upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(path);
      const novoIdx = p.etapa_fabricacao_idx + 1;
      const etapaConcluida = ETAPAS_FABRICACAO[p.etapa_fabricacao_idx];
      setProducoes(prev => prev.map(x => x.id === p.id ? { ...x, etapa_fabricacao_idx: novoIdx } : x));
      setFotosPorProducao(prev => ({ ...prev, [p.id]: urlData.publicUrl }));
      await supabase.from('pulse_producoes').update({ etapa_fabricacao_idx: novoIdx }).eq('id', p.id);
      await supabase.from('pulse_producao_eventos').insert([{
        producao_id: p.id, tipo: 'etapa', texto: `Etapa concluída: ${etapaConcluida}.`,
        foto_url: urlData.publicUrl, user_id: user?.id,
      }]);
      if (detalheId === p.id) carregarEventos(p.id);
    } catch (err: any) {
      alert('Erro ao concluir etapa: ' + (err?.message || 'tente novamente'));
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
    const { data } = await supabase.from('pulse_producao_eventos').select('id, tipo, texto, foto_url, user_id, created_at').eq('producao_id', producaoId).order('created_at', { ascending: true });
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

  const enviarFoto = async (file: File) => {
    if (!detalheId) return;
    setEnviandoFoto(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${perfil?.empresa_id}/producao-${detalheId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('produtos').upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(path);
      await supabase.from('pulse_producao_eventos').insert([{ producao_id: detalheId, tipo: 'anexo', foto_url: urlData.publicUrl, user_id: user?.id }]);
      carregarEventos(detalheId);
    } catch (err: any) {
      alert('Erro ao subir foto: ' + (err?.message || 'tente novamente'));
    } finally {
      setEnviandoFoto(false);
    }
  };

  const detalheProducao = producoes.find(p => p.id === detalheId) || null;

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Factory size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <Factory size={32} /> Produção
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Produção nasce sozinha na venda — acompanhe etapas e prazos aqui</p>
        </div>
        {isLideranca && (
          <div className="flex flex-wrap gap-2 self-start md:self-auto">
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
                          <p className="text-white font-bold text-sm truncate hover:underline">{p.produto_final_nome} <span className="text-slate-500 font-semibold">× {p.quantidade_produzida}</span></p>
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
                            {p.etapa_fabricacao_idx < ETAPAS_FABRICACAO.length - 1 && (
                              <label className="flex items-center gap-1 text-[9px] font-black text-amber-400 hover:text-amber-300 uppercase flex-shrink-0 cursor-pointer">
                                {concluindoEtapaId === p.id ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                                Concluir c/ foto
                                <input
                                  type="file" accept="image/*" capture="environment" className="hidden"
                                  disabled={concluindoEtapaId === p.id}
                                  onChange={e => { const f = e.target.files?.[0]; if (f) concluirEtapaComFoto(p, f); e.target.value = ''; }}
                                />
                              </label>
                            )}
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

      {detalheProducao && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={fecharDetalhe}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-5 border-b border-white/5 flex-shrink-0">
              <div className="min-w-0">
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
