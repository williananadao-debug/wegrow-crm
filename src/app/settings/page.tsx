"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Save, Trash2, Plus, Zap, Mic2, Radio, Info, Loader2, Package, CheckCircle2, AlertCircle, Building2, Megaphone, Smartphone, Headphones, Newspaper, Upload, History, X, Settings2, FileText, Copy, GripVertical, Boxes } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnidades } from '@/lib/useUnidades';

type HistoricoPreco = { preco_anterior: number; preco_novo: number; data: string };

type OpecUnitConfig = {
  id: string;
  nome: string;
  mercado_id: string;
  mercado_codigo: string;
  mercado_descricao: string;
  mercado_cnpj: string;
};

type ServicoConfig = {
  id: string;
  nome: string;
  preco: number;
  precoOriginal?: number;
  tipo: string;
  unidade: string;
  historico_precos?: HistoricoPreco[];
  estoque?: number | null;
  imagem_url?: string | null;
  sku?: string | null;
  preco_custo?: number | null;
  estoque_minimo?: number | null;
  produto_pai_id?: number | null;
  variante_nome?: string | null;
  ordem?: number | null;
};

type NfseConfig = {
  municipalServiceCode: string;
  municipalServiceName: string;
  retainIss: boolean;
  iss: number;
  pis: number;
  cofins: number;
  csll: number;
  inss: number;
  ir: number;
};

const NFSE_CONFIG_VAZIA: NfseConfig = {
  municipalServiceCode: '', municipalServiceName: '', retainIss: false,
  iss: 0, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0,
};

const CATEGORIAS_PADRAO = [
  'Comercial Gravado',
  'Feito ao Vivo',
  'Blitz',
  'Patrocínio',
  'Impacto Jornalístico',
  'Digital',
  'Podcast',
];

export default function SettingsPage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  const temPulse = Boolean(empresa?.modulos?.pulse);
  const user = auth.user;
  const perfil = auth.perfil;
  const { unidades } = useUnidades(perfil?.empresa_id);
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [histModalId, setHistModalId] = useState<string | null>(null);
  const [unidadesOpec, setUnidadesOpec] = useState<OpecUnitConfig[]>([]);
  const [savingOpec, setSavingOpec] = useState(false);
  const [feedbackOpec, setFeedbackOpec] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [nfseConfig, setNfseConfig] = useState<NfseConfig>(NFSE_CONFIG_VAZIA);
  const [savingNfse, setSavingNfse] = useState(false);
  const [feedbackNfse, setFeedbackNfse] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const histModal = histModalId ? servicos.find(s => s.id === histModalId) ?? null : null;
  const categoriasDisponiveis = Array.from(new Set([...CATEGORIAS_PADRAO, ...servicos.map(s => s.tipo).filter(Boolean)]));
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if(user) carregarDados();
  }, [user]);

  useEffect(() => {
    setUnidadesOpec(unidades.map(u => ({
      id: u.id,
      nome: u.nome,
      mercado_id: u.config_opec?.mercado_id || '',
      mercado_codigo: u.config_opec?.mercado_codigo || '',
      mercado_descricao: u.config_opec?.mercado_descricao || '',
      mercado_cnpj: u.config_opec?.mercado_cnpj || '',
    })));
  }, [unidades]);

  const carregarDados = async () => {
    setLoading(true);
    const { data: emp } = await supabase.from('empresas').select('modulos, nfse_config').eq('id', perfil?.empresa_id).single();
    if (emp?.nfse_config) setNfseConfig({ ...NFSE_CONFIG_VAZIA, ...emp.nfse_config });
    const { data, error } = await supabase.from('servicos').select('*').eq('empresa_id', perfil?.empresa_id).order('ordem', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
    
    if (error) console.error("Erro ao carregar:", error);

    if (data && data.length > 0) {
      const formatados = data.map((item: any) => ({
        id: item.id.toString(),
        nome: item.nome,
        preco: item.preco,
        precoOriginal: item.preco,
        tipo: item.tipo || 'Comercial Gravado',
        unidade: item.unidade || '',
        historico_precos: item.historico_precos || [],
        estoque: item.estoque ?? null,
        imagem_url: item.imagem_url ?? null,
        sku: item.sku ?? null,
        preco_custo: item.preco_custo ?? null,
        estoque_minimo: item.estoque_minimo ?? 5,
        produto_pai_id: item.produto_pai_id ?? null,
        variante_nome: item.variante_nome ?? null,
        ordem: item.ordem ?? null,
      }));
      setServicos(formatados);
    } else {
      setServicos([]);
    }
    setLoading(false);
  };

  const salvarConfiguracoes = async () => {
    // Sem empresa_id carregado, o insert cai fora da policy de RLS (empresa_id teria que
    // bater com meu_empresa_id()) e falha pra TODOS os itens novos de uma vez — melhor
    // travar aqui com mensagem clara do que deixar o Supabase rejeitar tudo em silêncio.
    if (!perfil?.empresa_id) {
      setFeedback({ type: 'error', msg: 'Perfil ainda carregando — aguarde um instante e tente salvar de novo.' });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
        const novos = servicos.filter(s => s.id.startsWith('temp-'));
        const existentes = servicos.filter(s => !s.id.startsWith('temp-'));
        // Cada promise carrega uma etiqueta ("novo: Nome" / "Nome") pra mensagem de erro
        // conseguir apontar exatamente qual item falhou, em vez de "alguns itens".
        const tarefas: { label: string; run: () => Promise<{ error: any; data: any }> }[] = [];

        if (novos.length > 0) {
            const payload = novos.map(s => ({
                nome: s.nome,
                preco: s.preco,
                tipo: s.tipo,
                unidade: s.unidade,
                estoque: s.estoque ?? null,
                sku: s.sku?.trim() || null,
                preco_custo: s.preco_custo ?? null,
                estoque_minimo: s.estoque_minimo ?? 5,
                produto_pai_id: s.produto_pai_id ?? null,
                variante_nome: s.variante_nome?.trim() || null,
                empresa_id: perfil.empresa_id,
            }));
            tarefas.push({
                label: `novo(s): ${novos.map(s => s.nome || '(sem nome)').join(', ')}`,
                // O query builder do Supabase é "thenable" mas não é um Promise de verdade
                // (falta .catch/.finally) — sem o async/await aqui, o TS aceita na sua
                // máquina mas o build da Vercel (next build --webpack) rejeita.
                run: async () => { const { error, data } = await supabase.from('servicos').insert(payload); return { error, data }; },
            });
        }

        existentes.forEach(s => {
            const historicoAtualizado = s.precoOriginal !== undefined && s.preco !== s.precoOriginal
                ? [...(s.historico_precos || []), { preco_anterior: s.precoOriginal, preco_novo: s.preco, data: new Date().toISOString() }]
                : (s.historico_precos || []);
            tarefas.push({
                label: s.nome || `#${s.id}`,
                // .select() pra detectar update "bem-sucedido" que na verdade não afetou
                // nenhuma linha (RLS filtrou em silêncio — sem .select() isso não vira erro).
                run: async () => {
                    const { error, data } = await supabase.from('servicos').update({
                        nome: s.nome,
                        preco: s.preco,
                        tipo: s.tipo,
                        unidade: s.unidade,
                        estoque: s.estoque ?? null,
                        sku: s.sku?.trim() || null,
                        preco_custo: s.preco_custo ?? null,
                        estoque_minimo: s.estoque_minimo ?? 5,
                        variante_nome: s.variante_nome?.trim() || null,
                        historico_precos: historicoAtualizado,
                    }).eq('id', parseInt(s.id)).select('id');
                    return { error, data };
                },
            });
        });

        const results = await Promise.all(tarefas.map(t => t.run()));
        const falhas = results
          .map((r, i) => ({ r, label: tarefas[i].label }))
          .filter(({ r }) => r.error || (Array.isArray(r.data) && r.data.length === 0));

        if (falhas.length > 0) {
          const detalhe = falhas.map(f => `${f.label}: ${f.r.error?.message || 'nenhuma linha afetada (sem permissão?)'}`).join(' · ');
          console.error('[settings/salvarConfiguracoes] falhas:', falhas);
          throw new Error(detalhe);
        }

        await carregarDados();
        setFeedback({ type: 'success', msg: 'Configurações salvas com sucesso!' });
    } catch (err: any) {
        console.error(err);
        setFeedback({ type: 'error', msg: 'Erro ao salvar: ' + (err.message || 'Verifique o console') });
    } finally {
        setSaving(false);
        setTimeout(() => setFeedback(null), 4000);
    }
  };

  const adicionarServico = () => {
    const novo: ServicoConfig = {
      id: `temp-${Date.now()}`,
      nome: 'Novo Serviço',
      preco: 0,
      tipo: 'Comercial Gravado',
      unidade: '',
      estoque: null,
    };
    setServicos([...servicos, novo]);
  };

  // Clona os campos em comum do produto base (tipo, unidade, preço, custo, mínimo) — o
  // vendedor só preenche o que muda de fato na variante (tamanho/cor/sabor) e o estoque.
  const criarVariante = (pai: ServicoConfig) => {
    const nova: ServicoConfig = {
      id: `temp-${Date.now()}-var`,
      nome: pai.nome,
      preco: pai.preco,
      tipo: pai.tipo,
      unidade: pai.unidade,
      estoque: pai.estoque !== null && pai.estoque !== undefined ? 0 : null,
      preco_custo: pai.preco_custo ?? null,
      estoque_minimo: pai.estoque_minimo ?? 5,
      produto_pai_id: Number(pai.id),
      variante_nome: '',
      historico_precos: [],
    };
    setServicos(prev => {
      const idx = prev.findIndex(s => s.id === pai.id);
      const copia = [...prev];
      copia.splice(idx + 1, 0, nova);
      return copia;
    });
  };

  const atualizarVarianteNome = (servico: ServicoConfig, valor: string) => {
    const pai = servicos.find(s => s.id === String(servico.produto_pai_id));
    const nomeBase = pai?.nome || servico.nome.split(' - ')[0];
    setServicos(prev => prev.map(s => s.id === servico.id ? { ...s, variante_nome: valor, nome: valor ? `${nomeBase} - ${valor}` : nomeBase } : s));
  };

  // Grupos = produto (pai ou avulso) + suas variantes. O arraste reordena grupos inteiros
  // — variante nunca se solta do pai, ela só acompanha a posição dele na lista.
  const gruposProdutos = (() => {
    const paisEAvulsos = servicos.filter(s => !s.produto_pai_id);
    const porPai: Record<string, ServicoConfig[]> = {};
    servicos.filter(s => s.produto_pai_id).forEach(s => {
      const chave = String(s.produto_pai_id);
      (porPai[chave] ||= []).push(s);
    });
    return paisEAvulsos.map(pai => ({ pai, variantes: porPai[pai.id] || [] }));
  })();

  const onDragEndProdutos = async (result: DropResult) => {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;

    const reordenados = Array.from(gruposProdutos);
    const [movido] = reordenados.splice(source.index, 1);
    reordenados.splice(destination.index, 0, movido);

    const novaOrdemPorId = new Map(reordenados.map((g, idx) => [g.pai.id, idx]));
    const alterados = gruposProdutos.filter(g => novaOrdemPorId.get(g.pai.id) !== g.pai.ordem);

    setServicos(prev => {
      const comNovaOrdem = prev.map(s => novaOrdemPorId.has(s.id) ? { ...s, ordem: novaOrdemPorId.get(s.id)! } : s);
      // Reordena o array de estado pra bater com o arraste visual (senão, ao recarregar
      // sem passar pelo servidor, a próxima renderização usaria a ordem antiga do array).
      const paisReordenados = reordenados.map(g => comNovaOrdem.find(s => s.id === g.pai.id)!);
      const variantesPorPai: Record<string, ServicoConfig[]> = {};
      comNovaOrdem.filter(s => s.produto_pai_id).forEach(s => {
        const chave = String(s.produto_pai_id);
        (variantesPorPai[chave] ||= []).push(s);
      });
      return paisReordenados.flatMap(p => [p, ...(variantesPorPai[p.id] || [])]);
    });

    await Promise.all(
      alterados
        .filter(g => !g.pai.id.startsWith('temp-'))
        .map(g => supabase.from('servicos').update({ ordem: novaOrdemPorId.get(g.pai.id) }).eq('id', parseInt(g.pai.id)))
    );
  };

  const removerServico = async (id: string) => {
    if (!id.startsWith('temp-')) {
        const { error } = await supabase.from('servicos').delete().eq('id', parseInt(id));
        if (error) return alert("Erro ao excluir do banco.");
    }
    setServicos(servicos.filter(s => s.id !== id));
  };

  const atualizarServico = (id: string, campo: keyof ServicoConfig, valor: any) => {
    setServicos(prev => prev.map(s => s.id === id ? { ...s, [campo]: valor } : s));
  };

  const [enviandoImagemId, setEnviandoImagemId] = useState<string | null>(null);

  const uploadImagemProduto = async (id: string, file: File) => {
    if (id.startsWith('temp-')) { alert('Salve o produto antes de subir a foto.'); return; }
    setEnviandoImagemId(id);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${perfil?.empresa_id}/${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('produtos').upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(path);
      const { error: updErr } = await supabase.from('servicos').update({ imagem_url: urlData.publicUrl }).eq('id', parseInt(id));
      if (updErr) throw updErr;
      atualizarServico(id, 'imagem_url', urlData.publicUrl);
    } catch (err: any) {
      alert('Erro ao subir foto: ' + (err?.message || 'tente novamente'));
    } finally {
      setEnviandoImagemId(null);
    }
  };

  // Split respeitando campos entre aspas (senão um valor como "104,7" quebra a coluna ao meio).
  const parseLinhaCSV = (linha: string): string[] => {
    const campos: string[] = [];
    let atual = '';
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') { dentroAspas = !dentroAspas; }
      else if (c === ',' && !dentroAspas) { campos.push(atual.trim()); atual = ''; }
      else { atual += c; }
    }
    campos.push(atual.trim());
    return campos;
  };

  const importarCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const linhas = text.trim().split('\n').map(parseLinhaCSV);
      if (linhas.length < 2) return;
      const headers = linhas[0].map(h => h.toLowerCase());
      const iNome = headers.indexOf('nome');
      const iPreco = headers.indexOf('preco');
      const iTipo = headers.indexOf('tipo');
      const iUnidade = headers.indexOf('unidade');
      const iSku = headers.indexOf('sku');
      const iPrecoCusto = headers.indexOf('preco_custo');
      const iEstoqueMinimo = headers.indexOf('estoque_minimo');
      if (iNome < 0 || iPreco < 0) {
        alert('CSV deve ter pelo menos as colunas: nome, preco');
        return;
      }
      const novos: ServicoConfig[] = linhas.slice(1).filter(cols => cols[iNome]).map((cols, i) => ({
        id: `temp-csv-${Date.now()}-${i}`,
        nome: cols[iNome] || '',
        preco: parseFloat(cols[iPreco]) || 0,
        tipo: (iTipo >= 0 ? cols[iTipo] : '') || 'Comercial Gravado',
        unidade: (iUnidade >= 0 ? cols[iUnidade] : '') || '',
        historico_precos: [],
        sku: iSku >= 0 ? (cols[iSku] || null) : null,
        preco_custo: iPrecoCusto >= 0 && cols[iPrecoCusto] ? parseFloat(cols[iPrecoCusto]) : null,
        estoque_minimo: iEstoqueMinimo >= 0 && cols[iEstoqueMinimo] ? parseFloat(cols[iEstoqueMinimo]) : 5,
      }));
      setServicos(prev => [...prev, ...novos]);
      setFeedback({ type: 'success', msg: `${novos.length} item(s) importado(s) do CSV.` });
      setTimeout(() => setFeedback(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const atualizarOpec = (id: string, campo: keyof OpecUnitConfig, valor: string) => {
    setUnidadesOpec(prev => prev.map(u => u.id === id ? { ...u, [campo]: valor } : u));
  };

  const salvarOpec = async () => {
    setSavingOpec(true);
    setFeedbackOpec(null);
    try {
      await Promise.all(unidadesOpec.map(u =>
        supabase.from('unidades').update({
          config_opec: {
            mercado_id: u.mercado_id,
            mercado_codigo: u.mercado_codigo,
            mercado_descricao: u.mercado_descricao,
            mercado_cnpj: u.mercado_cnpj,
          }
        }).eq('id', u.id)
      ));
      setFeedbackOpec({ type: 'success', msg: 'Config OPEC salva com sucesso!' });
    } catch (err: any) {
      setFeedbackOpec({ type: 'error', msg: 'Erro: ' + (err.message || 'Verifique o console') });
    } finally {
      setSavingOpec(false);
      setTimeout(() => setFeedbackOpec(null), 4000);
    }
  };

  const salvarNfseConfig = async () => {
    setSavingNfse(true);
    setFeedbackNfse(null);
    try {
      const { error } = await supabase.from('empresas').update({ nfse_config: nfseConfig }).eq('id', perfil?.empresa_id);
      if (error) throw error;
      setFeedbackNfse({ type: 'success', msg: 'Configuração de NFS-e salva com sucesso!' });
    } catch (err: any) {
      setFeedbackNfse({ type: 'error', msg: 'Erro: ' + (err.message || 'Verifique o console') });
    } finally {
      setSavingNfse(false);
      setTimeout(() => setFeedbackNfse(null), 4000);
    }
  };

  const getIconeCategoria = (tipo: string) => {
    switch (tipo) {
        case 'Comercial Gravado':
        case 'Mic2': 
            return <Mic2 className="text-blue-400" size={16} />;
        case 'Feito ao Vivo':
            return <Megaphone className="text-yellow-400" size={16} />;
        case 'Blitz':
        case 'Zap': 
            return <Zap className="text-yellow-400" size={16} />;
        case 'Patrocínio':
        case 'Radio': 
            return <Radio className="text-purple-400" size={16} />;
        case 'Impacto Jornalístico': // 👈 NOVO ÍCONE JORNALISMO
            return <Newspaper className="text-red-400" size={16} />;
        case 'Digital':
            return <Smartphone className="text-green-400" size={16} />;
        case 'Podcast':
            return <Headphones className="text-orange-400" size={16} />;
        default:
            return <Package className="text-slate-400" size={16} />;
    }
  };

  const renderProdutoRow = (servico: ServicoConfig, dragHandleProps?: any) => (
                <div key={servico.id} className={`relative grid grid-cols-12 gap-3 items-center bg-white/[0.02] p-3 rounded-2xl border group hover:border-white/10 transition-all hover:bg-white/[0.04] ${servico.produto_pai_id ? 'border-l-2 border-l-blue-500/40 border-y-white/5 border-r-white/5 ml-4 md:ml-8' : 'border-white/5'}`}>

                    {dragHandleProps && (
                        <div {...dragHandleProps} className="absolute -left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors touch-none" style={{ touchAction: 'none' }} title="Arrastar para reordenar">
                            <GripVertical size={14} />
                        </div>
                    )}

                    <div className="col-span-2 md:col-span-1 flex justify-center md:justify-start pl-0 md:pl-2">
                        {temPulse && !servico.id.startsWith('temp-') ? (
                            <label className="relative w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden cursor-pointer group/img" title="Subir foto do produto">
                                {enviandoImagemId === servico.id ? (
                                    <Loader2 size={14} className="animate-spin text-slate-400" />
                                ) : servico.imagem_url ? (
                                    <img src={servico.imagem_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    getIconeCategoria(servico.tipo)
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImagemProduto(servico.id, f); }} />
                            </label>
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
                                {servico.imagem_url ? <img src={servico.imagem_url} alt="" className="w-full h-full object-cover" /> : getIconeCategoria(servico.tipo)}
                            </div>
                        )}
                    </div>

                    <div className="col-span-10 md:col-span-3">
                        {servico.produto_pai_id ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest shrink-0">Variante:</span>
                                <input
                                    value={servico.variante_nome ?? ''}
                                    onChange={(e) => atualizarVarianteNome(servico, e.target.value)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-white/20 text-white font-bold text-sm focus:ring-0 outline-none placeholder:text-slate-600 py-1 transition-colors"
                                    placeholder="Ex: P, Azul, Morango"
                                />
                            </div>
                        ) : (
                            <input
                                value={servico.nome}
                                onChange={(e) => atualizarServico(servico.id, 'nome', e.target.value)}
                                className="w-full bg-transparent border-b border-transparent focus:border-white/20 text-white font-bold text-sm focus:ring-0 outline-none placeholder:text-slate-600 py-1 transition-colors"
                                placeholder="Nome (Ex: Spot 30s)"
                            />
                        )}
                    </div>

                    <div className="col-span-12 md:col-span-3 relative flex items-center bg-[#0F172A] rounded-lg px-3 py-1.5 border border-white/5 focus-within:border-blue-500 transition-colors">
                        <Building2 size={14} className="text-slate-500 mr-2 shrink-0"/>
                        <select
                            value={servico.unidade}
                            onChange={(e) => atualizarServico(servico.id, 'unidade', e.target.value)}
                            className="w-full bg-transparent text-slate-300 text-[10px] font-bold uppercase outline-none cursor-pointer appearance-none truncate"
                        >
                            <option value="" className="bg-[#0B1120]">Geral (Todas as Unidades)</option>
                            {unidades.map(u => (
                              <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div className="col-span-6 md:col-span-2 flex items-center gap-2 bg-[#0F172A] rounded-lg px-3 py-2 border border-white/5 focus-within:border-[var(--cor-primaria)] transition-colors">
                        <span className="text-[10px] font-black text-slate-500">R$</span>
                        <input
                            type="number"
                            value={servico.preco}
                            onChange={(e) => atualizarServico(servico.id, 'preco', Number(e.target.value))}
                            className="w-full bg-transparent text-white font-bold outline-none text-sm"
                            placeholder="0.00"
                        />
                    </div>

                    <div className="col-span-4 md:col-span-2 relative">
                        <select
                            value={servico.tipo}
                            onChange={(e) => atualizarServico(servico.id, 'tipo', e.target.value)}
                            className="w-full bg-white/5 text-slate-300 text-[10px] font-bold uppercase outline-none rounded-lg px-2 py-2.5 border border-white/5 focus:border-blue-500 transition-colors cursor-pointer appearance-none"
                        >
                            {categoriasDisponiveis.map(cat => (
                              <option key={cat} value={cat} className="bg-[#0B1120]">{cat}</option>
                            ))}
                        </select>
                    </div>

                    <div className="col-span-2 md:col-span-1 flex justify-end gap-1">
                        {!servico.id.startsWith('temp-') && !servico.produto_pai_id && (
                            <button onClick={() => criarVariante(servico)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-500/10 text-slate-600 hover:text-blue-400 transition-all" title="Criar variante (tamanho/cor/sabor)">
                                <Copy size={15} />
                            </button>
                        )}
                        {!servico.id.startsWith('temp-') && (servico.historico_precos?.length ?? 0) > 0 && (
                            <button onClick={() => setHistModalId(servico.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-yellow-500/10 text-slate-600 hover:text-yellow-400 transition-all" title="Histórico de preços">
                                <History size={15} />
                            </button>
                        )}
                        <button onClick={() => removerServico(servico.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-all">
                            <Trash2 size={16} />
                        </button>
                    </div>

                    <div className="col-span-12 flex flex-wrap items-center gap-2 pl-0 md:pl-11 -mt-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SKU</span>
                        <input
                            value={servico.sku ?? ''}
                            onChange={(e) => atualizarServico(servico.id, 'sku', e.target.value)}
                            className="w-28 bg-[#0F172A] border border-white/5 rounded-lg px-2 py-1 text-white text-xs font-bold outline-none focus:border-blue-500"
                            placeholder="código/barras"
                        />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Custo</span>
                        <div className="flex items-center gap-1 bg-[#0F172A] border border-white/5 rounded-lg px-2 py-1 focus-within:border-blue-500">
                            <span className="text-[9px] text-slate-500">R$</span>
                            <input
                                type="number" step="0.01"
                                value={servico.preco_custo ?? ''}
                                onChange={(e) => atualizarServico(servico.id, 'preco_custo', e.target.value === '' ? null : Number(e.target.value))}
                                className="w-16 bg-transparent text-white text-xs font-bold outline-none"
                                placeholder="0.00"
                            />
                        </div>
                        {servico.preco_custo != null && servico.preco > 0 && (
                            <span className="text-[9px] font-black text-slate-500">
                                margem {(((servico.preco - servico.preco_custo) / servico.preco) * 100).toFixed(0)}%
                            </span>
                        )}
                    </div>

                    {temPulse && (
                        <div className="col-span-12 flex flex-wrap items-center gap-2 pl-0 md:pl-11 -mt-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Estoque</span>
                            <button
                                type="button"
                                onClick={() => atualizarServico(servico.id, 'estoque', Math.max(0, (servico.estoque ?? 0) - 1))}
                                className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-slate-300 text-xs font-black"
                            >−</button>
                            <input
                                type="number"
                                value={servico.estoque ?? ''}
                                onChange={(e) => atualizarServico(servico.id, 'estoque', e.target.value === '' ? null : Number(e.target.value))}
                                className={`w-20 bg-[#0F172A] border rounded-lg px-2 py-1 text-white text-xs font-bold outline-none focus:border-[var(--cor-primaria)] text-center ${servico.estoque !== null && servico.estoque !== undefined && servico.estoque <= (servico.estoque_minimo ?? 5) ? 'border-red-500/40' : 'border-white/5'}`}
                                placeholder="não controla"
                            />
                            <button
                                type="button"
                                onClick={() => atualizarServico(servico.id, 'estoque', (servico.estoque ?? 0) + 1)}
                                className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-slate-300 text-xs font-black"
                            >+</button>
                            {servico.estoque !== null && servico.estoque !== undefined && (
                                <>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Mín.</span>
                                    <input
                                        type="number"
                                        value={servico.estoque_minimo ?? 5}
                                        onChange={(e) => atualizarServico(servico.id, 'estoque_minimo', e.target.value === '' ? 5 : Number(e.target.value))}
                                        className="w-14 bg-[#0F172A] border border-white/5 rounded-lg px-2 py-1 text-white text-xs font-bold outline-none focus:border-amber-500 text-center"
                                    />
                                </>
                            )}
                            {servico.estoque !== null && servico.estoque !== undefined && servico.estoque <= (servico.estoque_minimo ?? 5) && (
                                <span className="text-[9px] font-black text-red-400 uppercase">estoque baixo</span>
                            )}
                            <span className="text-[9px] text-slate-600">deixe em branco pra não controlar estoque desse item</span>
                            {!servico.id.startsWith('temp-') && servico.estoque !== null && servico.estoque !== undefined && (
                                <Link href="/pulse/estoque" className="ml-auto flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1 text-[9px] font-black text-slate-300 hover:text-white uppercase tracking-widest transition-all">
                                    <Boxes size={11} /> Ver estoque
                                </Link>
                            )}
                        </div>
                    )}
                </div>
  );

  return (
    <div className="p-4 md:p-8 pb-20 animate-in fade-in duration-500">
      
      <header className="mb-8">
        <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic flex items-center gap-3">
            <Package size={32} className="text-[var(--cor-primaria)]"/> Configurações
        </h1>
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Gerencie seus produtos e tabela de preços por filial</p>
      </header>

      <div className="max-w-6xl bg-[#0B1120] border border-white/10 rounded-[40px] p-6 md:p-8 shadow-2xl relative">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-6 mb-6 gap-4">
          <div className="flex items-center gap-3 text-slate-300">
            <Info size={18} className="text-blue-500" />
            <h2 className="font-bold text-sm uppercase tracking-wide">Catálogo de Serviços</h2>
          </div>
          <div className="flex items-center gap-2">
            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={importarCSV} />
            <button onClick={() => csvInputRef.current?.click()} className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
              <Upload size={14} /> Importar CSV
            </button>
            <button onClick={adicionarServico} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
              <Plus size={14} strokeWidth={3} /> Adicionar Item
            </button>
          </div>
        </div>

        {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="animate-spin mb-2" size={32}/>
                <span className="text-xs font-bold uppercase">Carregando catálogo...</span>
            </div>
        ) : (
            <DragDropContext onDragEnd={onDragEndProdutos}>
            <Droppable droppableId="produtos">
              {(providedDrop) => (
                <div ref={providedDrop.innerRef} {...providedDrop.droppableProps} className="space-y-3">
                {servicos.length === 0 && (
                    <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-slate-500 text-sm font-medium">Nenhum serviço cadastrado.</p>
                    </div>
                )}

                {gruposProdutos.map((grupo, index) => (
                    <Draggable key={grupo.pai.id} draggableId={grupo.pai.id} index={index}>
                      {(providedDrag, snapshot) => (
                        <div
                          ref={providedDrag.innerRef}
                          {...providedDrag.draggableProps}
                          className={`space-y-3 ${snapshot.isDragging ? 'opacity-90' : ''}`}
                        >
                          {renderProdutoRow(grupo.pai, providedDrag.dragHandleProps)}
                          {grupo.variantes.map(v => renderProdutoRow(v))}
                        </div>
                      )}
                    </Draggable>
                ))}
                {providedDrop.placeholder}
                </div>
              )}
            </Droppable>
            </DragDropContext>
        )}

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="h-6">
            {feedback && (
                <div className={`flex items-center gap-2 text-xs font-bold uppercase animate-in slide-in-from-left-2 ${feedback.type === 'success' ? 'text-[var(--cor-primaria)]' : 'text-red-500'}`}>
                    {feedback.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                    {feedback.msg}
                </div>
            )}
          </div>

          <button 
            onClick={salvarConfiguracoes}
            disabled={saving}
            className="w-full md:w-auto bg-[var(--cor-primaria)] hover:bg-[#1ea850] text-[#0F172A] px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgb(var(--cor-primaria-rgb)/30%)] hover:shadow-[0_0_30px_rgb(var(--cor-primaria-rgb)/50%)] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} />} 
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* OPEC Config Section */}
      {perfil?.cargo === 'diretor' && (
        <div className="max-w-6xl mt-6 bg-[#0B1120] border border-white/10 rounded-[40px] p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-6 mb-6 gap-4">
            <div className="flex items-center gap-3 text-slate-300">
              <Settings2 size={18} className="text-purple-400" />
              <div>
                <h2 className="font-bold text-sm uppercase tracking-wide">Configuração OPEC por Unidade</h2>
                <p className="text-slate-600 text-[10px] uppercase font-bold mt-0.5">IDs e códigos de integração com o sistema de automação de rádio</p>
              </div>
            </div>
          </div>

          {unidadesOpec.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">Nenhuma unidade cadastrada. Crie unidades no módulo de equipe.</p>
          ) : (
            <div className="space-y-4">
              {unidadesOpec.map(u => (
                <div key={u.id} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <Radio size={14} className="text-purple-400" />
                    <span className="text-white font-black text-xs uppercase tracking-wide">{u.nome}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest block mb-1">ID Mercado</label>
                      <input
                        value={u.mercado_id}
                        onChange={e => atualizarOpec(u.id, 'mercado_id', e.target.value)}
                        placeholder="Ex: 1"
                        className="w-full bg-[#0F172A] border border-white/5 focus:border-purple-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest block mb-1">Código</label>
                      <input
                        value={u.mercado_codigo}
                        onChange={e => atualizarOpec(u.id, 'mercado_codigo', e.target.value)}
                        placeholder="Ex: DM-1047"
                        className="w-full bg-[#0F172A] border border-white/5 focus:border-purple-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest block mb-1">Descrição</label>
                      <input
                        value={u.mercado_descricao}
                        onChange={e => atualizarOpec(u.id, 'mercado_descricao', e.target.value)}
                        placeholder="Ex: DEMAIS FM 104,7 TAIÓ"
                        className="w-full bg-[#0F172A] border border-white/5 focus:border-purple-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest block mb-1">CNPJ Faturamento</label>
                      <input
                        value={u.mercado_cnpj}
                        onChange={e => atualizarOpec(u.id, 'mercado_cnpj', e.target.value)}
                        placeholder="Ex: 75.835.629/0001-50"
                        className="w-full bg-[#0F172A] border border-white/5 focus:border-purple-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="h-6">
              {feedbackOpec && (
                <div className={`flex items-center gap-2 text-xs font-bold uppercase animate-in slide-in-from-left-2 ${feedbackOpec.type === 'success' ? 'text-[var(--cor-primaria)]' : 'text-red-500'}`}>
                  {feedbackOpec.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                  {feedbackOpec.msg}
                </div>
              )}
            </div>
            <button
              onClick={salvarOpec}
              disabled={savingOpec || unidadesOpec.length === 0}
              className="w-full md:w-auto bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-purple-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingOpec ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
              {savingOpec ? 'Salvando...' : 'Salvar Config OPEC'}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl bg-[#0B1120] border border-white/10 rounded-[40px] p-6 md:p-8 shadow-2xl relative mt-6">
        <div className="flex items-center gap-3 text-slate-300 border-b border-white/5 pb-6 mb-6">
          <FileText size={18} className="text-blue-500" />
          <div>
            <h2 className="font-bold text-sm uppercase tracking-wide">Emissão de Nota Fiscal (NFS-e)</h2>
            <p className="text-slate-500 text-[10px] font-medium mt-0.5">Confirme os valores com seu contador antes de emitir a primeira nota — código de serviço e alíquotas erradas têm implicação fiscal real.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Código do Serviço Municipal</label>
            <input
              value={nfseConfig.municipalServiceCode}
              onChange={e => setNfseConfig(c => ({ ...c, municipalServiceCode: e.target.value }))}
              placeholder="Ex: 107 (varia por município)"
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[var(--cor-primaria)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Nome do Serviço Municipal</label>
            <input
              value={nfseConfig.municipalServiceName}
              onChange={e => setNfseConfig(c => ({ ...c, municipalServiceName: e.target.value }))}
              placeholder="Ex: Veiculação de publicidade"
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[var(--cor-primaria)]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-300 mb-5">
          <input type="checkbox" checked={nfseConfig.retainIss} onChange={e => setNfseConfig(c => ({ ...c, retainIss: e.target.checked }))} className="accent-[var(--cor-primaria)]" />
          Reter ISS na fonte
        </label>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {([
            ['iss', 'ISS %'], ['pis', 'PIS %'], ['cofins', 'COFINS %'],
            ['csll', 'CSLL %'], ['inss', 'INSS %'], ['ir', 'IR %'],
          ] as const).map(([campo, label]) => (
            <div key={campo}>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">{label}</label>
              <input
                type="number"
                step="0.01"
                value={nfseConfig[campo]}
                onChange={e => setNfseConfig(c => ({ ...c, [campo]: Number(e.target.value) }))}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none focus:border-[var(--cor-primaria)]"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4">
          {feedbackNfse && (
            <div className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl ${feedbackNfse.type === 'success' ? 'bg-[rgb(var(--cor-primaria-rgb)/10%)] text-[var(--cor-primaria)]' : 'bg-red-500/10 text-red-400'}`}>
              {feedbackNfse.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
              {feedbackNfse.msg}
            </div>
          )}
          <button
            onClick={salvarNfseConfig}
            disabled={savingNfse}
            className="w-full md:w-auto md:ml-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {savingNfse ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
            {savingNfse ? 'Salvando...' : 'Salvar Config NFS-e'}
          </button>
        </div>
      </div>

      {histModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-white/10">
              <div>
                <h2 className="font-black text-white uppercase italic flex items-center gap-2"><History size={16} className="text-yellow-400"/> Histórico de Preços</h2>
                <p className="text-slate-500 text-[10px] uppercase font-bold mt-0.5">{histModal.nome}</p>
              </div>
              <button onClick={() => setHistModalId(null)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {[...(histModal.historico_precos || [])].reverse().map((h, i) => (
                <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase font-black">{new Date(h.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="text-white text-sm font-black mt-0.5">
                      R$ {h.preco_anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      <span className="text-slate-500 mx-2">→</span>
                      <span className="text-[var(--cor-primaria)]">R$ {h.preco_novo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${h.preco_novo > h.preco_anterior ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {h.preco_novo > h.preco_anterior ? '▲' : '▼'} {Math.abs(Math.round(((h.preco_novo - h.preco_anterior) / h.preco_anterior) * 100))}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}