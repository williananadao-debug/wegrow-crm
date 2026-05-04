"use client";
import { useState, useEffect, useRef } from 'react';
import { Save, Trash2, Plus, Zap, Mic2, Radio, Info, Loader2, Package, CheckCircle2, AlertCircle, Building2, Megaphone, Smartphone, Headphones, Newspaper, Upload, History, X, Settings2, Link2, Eye, EyeOff } from 'lucide-react';
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
};

export default function SettingsPage() {
  const auth = useAuth() || {};
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
  const [zapsignToken, setZapsignToken] = useState('');
  const [savingZap, setSavingZap] = useState(false);
  const [feedbackZap, setFeedbackZap] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [showZapToken, setShowZapToken] = useState(false);
  const histModal = histModalId ? servicos.find(s => s.id === histModalId) ?? null : null;
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
    const { data: emp } = await supabase.from('empresas').select('modulos').eq('id', perfil?.empresa_id).single();
    if (emp?.modulos?.zapsign_token) setZapsignToken(emp.modulos.zapsign_token);

    const { data, error } = await supabase.from('servicos').select('*').eq('empresa_id', perfil?.empresa_id).order('id', { ascending: true });
    
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
      }));
      setServicos(formatados);
    } else {
      setServicos([]);
    }
    setLoading(false);
  };

  const salvarConfiguracoes = async () => {
    setSaving(true);
    setFeedback(null);

    try {
        const novos = servicos.filter(s => s.id.startsWith('temp-'));
        const existentes = servicos.filter(s => !s.id.startsWith('temp-'));
        const promises = [];

        if (novos.length > 0) {
            const payload = novos.map(s => ({
                nome: s.nome,
                preco: s.preco,
                tipo: s.tipo,
                unidade: s.unidade,
                empresa_id: perfil?.empresa_id 
            }));
            promises.push(supabase.from('servicos').insert(payload));
        }

        existentes.forEach(s => {
            const historicoAtualizado = s.precoOriginal !== undefined && s.preco !== s.precoOriginal
                ? [...(s.historico_precos || []), { preco_anterior: s.precoOriginal, preco_novo: s.preco, data: new Date().toISOString() }]
                : (s.historico_precos || []);
            promises.push(
                supabase.from('servicos').update({
                    nome: s.nome,
                    preco: s.preco,
                    tipo: s.tipo,
                    unidade: s.unidade,
                    historico_precos: historicoAtualizado,
                }).eq('id', parseInt(s.id))
            );
        });

        const results = await Promise.all(promises);
        const errors = results.filter(r => r.error);
        if (errors.length > 0) throw new Error("Falha ao salvar alguns itens.");

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
      unidade: '' 
    };
    setServicos([...servicos, novo]);
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

  const importarCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const linhas = text.trim().split('\n').map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
      if (linhas.length < 2) return;
      const headers = linhas[0].map(h => h.toLowerCase());
      const iNome = headers.indexOf('nome');
      const iPreco = headers.indexOf('preco');
      const iTipo = headers.indexOf('tipo');
      const iUnidade = headers.indexOf('unidade');
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

  const salvarZapsign = async () => {
    setSavingZap(true);
    setFeedbackZap(null);
    const { data: emp } = await supabase.from('empresas').select('modulos').eq('id', perfil?.empresa_id).single();
    const modulosAtuais = emp?.modulos || {};
    const { error } = await supabase.from('empresas').update({ modulos: { ...modulosAtuais, zapsign_token: zapsignToken.trim() } }).eq('id', perfil?.empresa_id);
    if (error) setFeedbackZap({ type: 'error', msg: 'Erro ao salvar token.' });
    else setFeedbackZap({ type: 'success', msg: 'Token ZapSign salvo!' });
    setSavingZap(false);
    setTimeout(() => setFeedbackZap(null), 4000);
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

  return (
    <div className="p-4 md:p-8 pb-20 animate-in fade-in duration-500">
      
      <header className="mb-8">
        <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic flex items-center gap-3">
            <Package size={32} className="text-[#22C55E]"/> Configurações
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
            <div className="space-y-3">
            {servicos.length === 0 && (
                <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                    <p className="text-slate-500 text-sm font-medium">Nenhum serviço cadastrado.</p>
                </div>
            )}
            
            {servicos.map((servico) => (
                <div key={servico.id} className="grid grid-cols-12 gap-3 items-center bg-white/[0.02] p-3 rounded-2xl border border-white/5 group hover:border-white/10 transition-all hover:bg-white/[0.04]">
                    
                    <div className="col-span-2 md:col-span-1 flex justify-center md:justify-start pl-0 md:pl-2">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            {getIconeCategoria(servico.tipo)}
                        </div>
                    </div>
                    
                    <div className="col-span-10 md:col-span-3">
                        <input 
                            value={servico.nome} 
                            onChange={(e) => atualizarServico(servico.id, 'nome', e.target.value)}
                            className="w-full bg-transparent border-b border-transparent focus:border-white/20 text-white font-bold text-sm focus:ring-0 outline-none placeholder:text-slate-600 py-1 transition-colors"
                            placeholder="Nome (Ex: Spot 30s)"
                        />
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

                    <div className="col-span-6 md:col-span-2 flex items-center gap-2 bg-[#0F172A] rounded-lg px-3 py-2 border border-white/5 focus-within:border-[#22C55E] transition-colors">
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
                        <input 
                            list={`categorias-list-${servico.id}`}
                            value={servico.tipo}
                            onChange={(e) => atualizarServico(servico.id, 'tipo', e.target.value)}
                            className="w-full bg-white/5 text-slate-300 text-[10px] font-bold uppercase outline-none rounded-lg px-2 py-2.5 border border-white/5 focus:border-blue-500 transition-colors"
                            placeholder="Categoria..."
                        />
                        <datalist id={`categorias-list-${servico.id}`}>
                            <option value="Comercial Gravado" />
                            <option value="Feito ao Vivo" />
                            <option value="Blitz" />
                            <option value="Patrocínio" />
                            <option value="Impacto Jornalístico" /> {/* 👈 ADICIONADO NA LISTA */}
                            <option value="Digital" />
                            <option value="Podcast" />
                        </datalist>
                    </div>

                    <div className="col-span-2 md:col-span-1 flex justify-end gap-1">
                        {!servico.id.startsWith('temp-') && (servico.historico_precos?.length ?? 0) > 0 && (
                            <button onClick={() => setHistModalId(servico.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-yellow-500/10 text-slate-600 hover:text-yellow-400 transition-all" title="Histórico de preços">
                                <History size={15} />
                            </button>
                        )}
                        <button onClick={() => removerServico(servico.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-all">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            ))}
            </div>
        )}

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="h-6">
            {feedback && (
                <div className={`flex items-center gap-2 text-xs font-bold uppercase animate-in slide-in-from-left-2 ${feedback.type === 'success' ? 'text-[#22C55E]' : 'text-red-500'}`}>
                    {feedback.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                    {feedback.msg}
                </div>
            )}
          </div>

          <button 
            onClick={salvarConfiguracoes}
            disabled={saving}
            className="w-full md:w-auto bg-[#22C55E] hover:bg-[#1ea850] text-[#0F172A] px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <div className={`flex items-center gap-2 text-xs font-bold uppercase animate-in slide-in-from-left-2 ${feedbackOpec.type === 'success' ? 'text-[#22C55E]' : 'text-red-500'}`}>
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

      {/* ZapSign Integration */}
      {perfil?.cargo === 'diretor' && (
        <div className="max-w-6xl mt-6 bg-[#0B1120] border border-white/10 rounded-[40px] p-6 md:p-8 shadow-2xl">
          <div className="flex items-center gap-3 text-slate-300 border-b border-white/5 pb-6 mb-6">
            <Link2 size={18} className="text-blue-400" />
            <div>
              <h2 className="font-bold text-sm uppercase tracking-wide">Assinatura Digital — ZapSign</h2>
              <p className="text-slate-600 text-[10px] uppercase font-bold mt-0.5">Conecte sua conta ZapSign para enviar contratos para assinatura diretamente dos negócios</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">API Token ZapSign</label>
              <div className="relative mt-1">
                <input
                  type={showZapToken ? 'text' : 'password'}
                  value={zapsignToken}
                  onChange={e => setZapsignToken(e.target.value)}
                  placeholder="Cole aqui o seu API Token do ZapSign..."
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white outline-none focus:border-blue-500 transition-colors pr-12"
                />
                <button type="button" onClick={() => setShowZapToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                  {showZapToken ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1 ml-1">Encontre em: <span className="text-blue-400 font-bold">app.zapsign.com.br → Configurações → API</span></p>
            </div>

            <div className="flex items-center justify-between pt-2">
              {feedbackZap && (
                <div className={`flex items-center gap-2 text-xs font-bold ${feedbackZap.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {feedbackZap.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>} {feedbackZap.msg}
                </div>
              )}
              {!feedbackZap && <span />}
              <button
                onClick={salvarZapsign}
                disabled={savingZap || !zapsignToken.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingZap ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>}
                {savingZap ? 'Salvando...' : 'Salvar Token'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                      <span className="text-[#22C55E]">R$ {h.preco_novo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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