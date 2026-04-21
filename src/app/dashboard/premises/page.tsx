"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Target, Users, MapPin, Calendar, CheckCircle2, Play, AlertCircle,
  Sparkles, Clock, TrendingUp, Zap, RefreshCcw, User, ShieldCheck, Map, Search, X, BarChart3
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';
import { useUnidades } from '@/lib/useUnidades';

export default function PremisesPage() {
  const { user, perfil } = useAuth();
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [premissas, setPremissas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'ai' | 'manual' | 'unidade'>('ai');

  // Estados da IA
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [tipoIA, setTipoIA] = useState<'resgate' | 'churn' | 'mix'>('resgate');
  const [diasInativo, setDiasInativo] = useState(60);
  const [produtoFoco, setProdutoFoco] = useState('SPOT 30"');
  const [quantidadeIA, setQuantidadeIA] = useState(5); 
  const [unidadeEstrategiaIA, setUnidadeEstrategiaIA] = useState(''); 
  
  // Estados do Manual
  const [quantidadeManual, setQuantidadeManual] = useState(5);
  const [unidadeEstrategiaManual, setUnidadeEstrategiaManual] = useState(''); 
  
  // Estados de Unidades / Cidades
  // listaUnidades vem do banco via useUnidades (substituí o useState hardcoded)
  const [unidadeSelecionada, setUnidadeSelecionada] = useState('');
  const [cidadesIBGE, setCidadesIBGE] = useState<string[]>([]);
  const [buscaCidade, setBuscaCidade] = useState('');
  const [cidadesSelecionadas, setCidadesSelecionadas] = useState<string[]>([]);
  
  // 👇 AQUI FICAM OS MAPEAMENTOS QUE VÊM DO BANCO DE DADOS 👇
  const [mapeamentosSalvos, setMapeamentosSalvos] = useState<any[]>([]);

  const [rawLeadsIA, setRawLeadsIA] = useState<any[]>([]);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const isDirector = perfil?.cargo === 'diretor';
  const { unidades } = useUnidades(perfil?.empresa_id);

  useEffect(() => {
    if (user && isDirector && perfil?.empresa_id) {
      fetchVendedores();
      fetchHistorico();
      fetchLeadsIA();
      fetchCidadesIBGE();
      fetchMapeamentos();
    }
  }, [user, isDirector, perfil?.empresa_id]);

  const fetchCidadesIBGE = async () => {
    try {
      const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados/SC/municipios');
      const data = await response.json();
      const nomes = data.map((c: any) => c.nome);
      setCidadesIBGE(nomes);
    } catch (error) {
      console.error("Erro ao puxar IBGE:", error);
    }
  };

  const fetchVendedores = async () => {
    const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('empresa_id', perfil?.empresa_id)
        .neq('cargo', 'diretor');
    setVendedores(data || []);
  };

  const fetchLeadsIA = async () => {
    const { data } = await supabase
      .from('leads')
      .select('id, status, valor_total, origem, descricao, user_id')
      .eq('empresa_id', perfil?.empresa_id)
      .or('origem.ilike.%IA%,origem.ilike.%Inteligência%,origem.ilike.%Estratégia%,descricao.ilike.%IA Sugere%')
      .limit(500);
    setRawLeadsIA(data || []);
  };

  const fetchHistorico = async () => {
    const { data, error } = await supabase
        .from('premissas')
        .select('*')
        .eq('empresa_id', perfil?.empresa_id)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error) console.error("Erro ao puxar histórico:", error.message);
    setPremissas(data || []);
  };

  // 👇 FUNÇÃO NOVA: BUSCA OS CLUSTERS REAIS NO SUPABASE 👇
  const fetchMapeamentos = async () => {
    const { data, error } = await supabase
        .from('unidades_cidades')
        .select('*')
        .eq('empresa_id', perfil?.empresa_id)
        .order('created_at', { ascending: false });
    
    if (!error && data) {
        setMapeamentosSalvos(data);
    }
  };

  const gerarInteligente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perfil?.empresa_id) return alert("Erro: Empresa não identificada.");
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('gerar_estrategia_ia_v2', {
        p_tipo: tipoIA,
        p_dias_inativo: diasInativo,
        p_vendedor_id: selectedVendedor || null,
        p_produto_foco: produtoFoco,
        p_criado_por: user.id,
        p_empresa_id: perfil?.empresa_id, 
        p_limite: quantidadeIA 
      });
      if (error) throw error;
      setToastMessage(`🤖 IA em ação! ${data || 0} novas oportunidades no funil.`);
      setShowToast(true);
      fetchHistorico();
      fetchLeadsIA();
    } catch (err: any) { alert("Erro na Inteligência: " + err.message); }
    setLoading(false);
  };

  const gerarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidadeEstrategiaManual || !selectedVendedor) {
        alert("⚠️ ATENÇÃO: Preencha o vendedor e a unidade antes de disparar!");
        return;
    }

    setLoading(true);
    try {
      const { error: err1 } = await supabase.from('premissas').insert([{
        titulo: `Prospecção Manual: ${unidadeEstrategiaManual}`, 
        quantidade: quantidadeManual, 
        regiao: unidadeEstrategiaManual, 
        tipo_cliente: 'Anunciante',
        user_id: selectedVendedor, 
        criado_por: user.id, 
        empresa_id: perfil?.empresa_id
      }]);
      
      if (err1) throw new Error("Erro ao guardar histórico: " + err1.message);

      const leads = Array.from({ length: Number(quantidadeManual) }).map((_, i) => ({
        empresa: `🎯 Alvo: ${unidadeEstrategiaManual} #${i + 1}`,
        tipo: 'Anunciante',
        status: 'aberto', 
        etapa: 0,
        user_id: selectedVendedor, 
        origem: 'Estratégia Manual',
        descricao: `Meta de prospecção gerada para a unidade ${unidadeEstrategiaManual}`,
        empresa_id: perfil?.empresa_id
      }));

      const { error: err2 } = await supabase.from('leads').insert(leads);
      if (err2) throw new Error("Erro ao gerar leads: " + err2.message);

      setToastMessage(`✅ ${quantidadeManual} alvos enviados para o funil!`);
      setShowToast(true);
      setUnidadeEstrategiaManual('');
      fetchHistorico();
      fetchLeadsIA();
    } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  const toggleCidade = (cidade: string) => {
    if (cidadesSelecionadas.includes(cidade)) {
        setCidadesSelecionadas(prev => prev.filter(c => c !== cidade));
    } else {
        setCidadesSelecionadas(prev => [...prev, cidade]);
    }
  };

  // 👇 FUNÇÃO ATUALIZADA: AGORA SALVA DE VERDADE NO BANCO DE DADOS 👇
  const salvarMapeamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidadeSelecionada || cidadesSelecionadas.length === 0) {
        alert("⚠️ Escolha uma Unidade e selecione pelo menos uma cidade!");
        return;
    }

    setLoading(true);
    try {
        // Prepara os dados para o Supabase
        const inserts = cidadesSelecionadas.map((cidade) => ({
            empresa_id: perfil?.empresa_id,
            unidade: unidadeSelecionada,
            cidade: cidade
        }));
        
        // Dispara para o banco de dados
        const { error } = await supabase.from('unidades_cidades').insert(inserts);
        
        if (error) throw error;
        
        // Limpa a tela e atualiza a lista visual
        setCidadesSelecionadas([]);
        setBuscaCidade('');
        fetchMapeamentos(); 
        
        setToastMessage(`✅ ${cidadesSelecionadas.length} cidades salvas na ${unidadeSelecionada}!`);
        setShowToast(true);
    } catch (err: any) { 
        alert("Erro ao salvar: " + err.message); 
    }
    setLoading(false);
  };

  // Função para remover um mapeamento salvo
  const deletarMapeamento = async (id: string) => {
      const confirmacao = window.confirm("Remover esta cidade do cluster?");
      if (!confirmacao) return;

      try {
          const { error } = await supabase.from('unidades_cidades').delete().eq('id', id);
          if (error) throw error;
          fetchMapeamentos();
      } catch (err: any) {
          alert("Erro ao remover: " + err.message);
      }
  };

  const cidadesFiltradas = cidadesIBGE.filter(c => c.toLowerCase().includes(buscaCidade.toLowerCase()));

  if (!isDirector) return <div className="p-10 text-white text-center font-black uppercase">Acesso Restrito</div>;

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#0B1120] min-h-screen text-white animate-in fade-in duration-700">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter flex items-center gap-3">
            <Target className="text-[#22C55E]" size={32}/> Central de Estratégia
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-1">Inteligência aplicada a dados reais</p>
        </div>
        
        <div className="grid grid-cols-2 md:flex gap-4 w-full md:w-auto">
            <div className="bg-white/5 border border-white/10 p-4 rounded-3xl flex-1 md:min-w-[150px]">
                <p className="text-purple-400 text-[9px] font-black uppercase tracking-widest mb-1">Leads da IA</p>
                <h3 className="text-2xl font-black italic">
                    {premissas.filter(p => p.tipo_cliente === 'Recuperação').reduce((acc, p) => acc + (p.quantidade || 0), 0)}
                </h3>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-3xl flex-1 md:min-w-[150px]">
                <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest mb-1">Última Ação (IA)</p>
                <h3 className="text-lg font-black italic mt-1 text-slate-300">
                    {premissas.filter(p => p.tipo_cliente === 'Recuperação').length > 0 ? new Date(premissas.filter(p => p.tipo_cliente === 'Recuperação')[0].created_at).toLocaleDateString('pt-BR') : 'Nenhuma'}
                </h3>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-5">
          <div className="bg-[#0F172A] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl flex flex-col h-[calc(100vh-140px)]">
            
            {/* 👇 MENU CORRIGIDO: Textos não vazam mais e se adaptam ao tamanho 👇 */}
            <div className="flex p-1.5 bg-[#0B1120]/50 m-4 rounded-2xl gap-1.5 shrink-0">
                <button onClick={() => setActiveTab('ai')} className={`flex-1 py-3 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all overflow-hidden ${activeTab === 'ai' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                    <Sparkles size={14}/> 
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tighter w-full text-center truncate">Inteligência</span>
                </button>
                <button onClick={() => setActiveTab('manual')} className={`flex-1 py-3 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all overflow-hidden ${activeTab === 'manual' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                    <Target size={14}/> 
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tighter w-full text-center truncate">Manual</span>
                </button>
                <button onClick={() => setActiveTab('unidade')} className={`flex-1 py-3 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all overflow-hidden ${activeTab === 'unidade' ? 'bg-[#22C55E] text-[#0F172A] shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                    <Map size={14}/> 
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tighter w-full text-center truncate">Unidades</span>
                </button>
            </div>

            <div className="p-8 pt-2 flex-1 overflow-y-auto custom-scrollbar pb-12">
              
              {/* ABA IA */}
              {activeTab === 'ai' && (
                <form onSubmit={gerarInteligente} className="space-y-6 animate-in fade-in duration-300">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-3 block">Tipo de Algoritmo</label>
                        <div className="grid grid-cols-1 gap-2">
                            <button type="button" onClick={() => setTipoIA('resgate')} className={`p-4 rounded-xl border text-left transition-all ${tipoIA === 'resgate' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                                <div className="flex items-center gap-2 font-black text-[11px] uppercase"><RefreshCcw size={14}/> Resgate de Inativos</div>
                            </button>
                            <button type="button" onClick={() => setTipoIA('churn')} className={`p-4 rounded-xl border text-left transition-all ${tipoIA === 'churn' ? 'bg-orange-600/20 border-orange-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                                <div className="flex items-center gap-2 font-black text-[11px] uppercase"><AlertCircle size={14}/> Prevenção de Perda</div>
                            </button>
                            <button type="button" onClick={() => setTipoIA('mix')} className={`p-4 rounded-xl border text-left transition-all ${tipoIA === 'mix' ? 'bg-green-600/20 border-green-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                                <div className="flex items-center gap-2 font-black text-[11px] uppercase"><TrendingUp size={14}/> Primeira Compra</div>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Vendedor Destino</label>
                            <select className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-purple-500 appearance-none" value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)}>
                                <option value="" className="bg-[#0B1120]">Toda a Equipe (Geral)</option>
                                {vendedores.map(v => <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>)}
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block flex items-center gap-1"><MapPin size={12}/> Unidade Alvo (Opcional)</label>
                            <select className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-purple-500 appearance-none" value={unidadeEstrategiaIA} onChange={e => setUnidadeEstrategiaIA(e.target.value)}>
                                <option value="" className="bg-[#0B1120]">Sem restrição (Qualquer Unidade)</option>
                                {unidades.map(u => <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Qtd. Máx. Leads</label>
                            <input type="number" min="1" max="50" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-purple-500" value={quantidadeIA} onChange={e => setQuantidadeIA(Number(e.target.value))} />
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Dias Inativo</label>
                            <input type="number" disabled={tipoIA !== 'resgate'} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-purple-500 disabled:opacity-30" value={diasInativo} onChange={e => setDiasInativo(Number(e.target.value))} />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="w-full bg-gradient-to-br from-purple-600 to-blue-700 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-purple-900/40 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all">
                        {loading ? <Clock className="animate-spin" size={18}/> : <><Sparkles size={18}/> Iniciar Algoritmo</>}
                    </button>
                </form>
              )}

              {/* ABA MANUAL */}
              {activeTab === 'manual' && (
                <form onSubmit={gerarManual} className="space-y-6 animate-in fade-in duration-300">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Vendedor Alvo</label>
                        <select className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-blue-500" value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} required>
                            <option value="" className="bg-[#0B1120]">Selecione o Soldado...</option>
                            {vendedores.map(v => <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block flex items-center gap-1"><MapPin size={12}/> Unidade / Emissora Alvo</label>
                        <select className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-blue-500" value={unidadeEstrategiaManual} onChange={e => setUnidadeEstrategiaManual(e.target.value)} required>
                            <option value="" className="bg-[#0B1120]">Selecione a Unidade...</option>
                            {unidades.map(u => <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Quantidade de Visitas</label>
                        <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-blue-500" value={quantidadeManual} onChange={e => setQuantidadeManual(Number(e.target.value))} />
                    </div>

                    <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-blue-900/40 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all">
                        {loading ? 'Processando...' : <><Play size={18}/> Disparar Campanha</>}
                    </button>
                </form>
              )}

              {/* ABA DE UNIDADES COM SELEÇÃO MÚLTIPLA */}
              {activeTab === 'unidade' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <form onSubmit={salvarMapeamento} className="space-y-6">
                        
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">1. Selecione a Unidade / Emissora</label>
                            <select 
                                className="w-full bg-blue-600 border border-blue-500 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none appearance-none shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer" 
                                value={unidadeSelecionada} 
                                onChange={e => setUnidadeSelecionada(e.target.value)} 
                                required
                            >
                                <option value="" className="bg-[#0B1120] text-slate-400">TODAS UNIDADES (Escolha uma...)</option>
                                {unidades.map(u => (
                                    <option key={u.id} value={u.nome} className="bg-[#0B1120] text-white py-2">{u.nome}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block flex items-center justify-between">
                                <span>2. Selecione as Cidades</span>
                                <span className="bg-[#22C55E]/20 text-[#22C55E] px-2 py-0.5 rounded-full text-[10px]">IBGE</span>
                            </label>
                            
                            <div className="relative mb-2">
                                <Search className="absolute left-4 top-4 text-slate-500" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="Buscar cidade em SC..." 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none focus:border-[#22C55E]" 
                                    value={buscaCidade} 
                                    onChange={e => setBuscaCidade(e.target.value)} 
                                />
                            </div>

                            <div className="bg-[#0B1120] border border-white/10 rounded-xl p-2 h-32 overflow-y-auto custom-scrollbar">
                                {cidadesFiltradas.length === 0 ? (
                                    <div className="text-center text-slate-500 text-xs py-4">Nenhuma cidade encontrada</div>
                                ) : (
                                    cidadesFiltradas.map(cidade => {
                                        const isSelected = cidadesSelecionadas.includes(cidade);
                                        return (
                                            <button
                                                key={cidade}
                                                type="button"
                                                onClick={() => toggleCidade(cidade)}
                                                className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-all flex items-center justify-between text-sm ${
                                                    isSelected ? 'bg-[#22C55E]/20 text-[#22C55E] font-bold' : 'text-slate-300 hover:bg-white/5'
                                                }`}
                                            >
                                                {cidade}
                                                {isSelected && <CheckCircle2 size={16} />}
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </div>

                        {cidadesSelecionadas.length > 0 && (
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-wrap gap-2">
                                {cidadesSelecionadas.map(cidade => (
                                    <div key={cidade} className="bg-[#0F172A] border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold text-white animate-in zoom-in duration-200">
                                        <MapPin size={12} className="text-[#22C55E]" />
                                        {cidade}
                                        <button type="button" onClick={() => toggleCidade(cidade)} className="text-slate-500 hover:text-red-400 ml-1">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button type="submit" disabled={loading || cidadesSelecionadas.length === 0 || !unidadeSelecionada} className="w-full bg-[#22C55E] disabled:opacity-50 disabled:cursor-not-allowed text-[#0F172A] py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-[0_0_15px_rgba(34,197,94,0.3)] flex items-center justify-center gap-3 hover:scale-[1.02] transition-all mb-4">
                            {loading ? 'A Guardar...' : <><MapPin size={18}/> Salvar {cidadesSelecionadas.length} cidade(s) na Unidade</>}
                        </button>
                    </form>

                    {/* 👇 AGORA MOSTRA OS DADOS PUXADOS DO SUPABASE 👇 */}
                    {mapeamentosSalvos.length > 0 && (
                      <div className="pt-4 border-t border-white/5">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-3 block flex justify-between">
                            <span>Mapeamentos Salvos</span>
                            <span>{mapeamentosSalvos.length} Cidades</span>
                        </label>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                          {mapeamentosSalvos.map(m => (
                            <div key={m.id} className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between animate-in fade-in duration-300 group">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[#22C55E]/20 rounded-lg flex items-center justify-center text-[#22C55E]"><MapPin size={14}/></div>
                                <div>
                                  <p className="text-white text-sm font-bold">{m.cidade}</p>
                                  <p className="text-slate-500 text-[10px] font-bold uppercase">{m.unidade}</p>
                                </div>
                              </div>
                              <button onClick={() => deletarMapeamento(m.id)} className="text-slate-600 hover:text-red-500 transition-colors p-2 opacity-0 group-hover:opacity-100">
                                  <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PAINEL DE EFICÁCIA (Lado Direito) */}
        <div className="lg:col-span-7 space-y-6">

          {/* KPIs de Eficácia */}
          {(() => {
            const totalGerados = rawLeadsIA.length;
            const ganhos = rawLeadsIA.filter(l => l.status === 'ganho');
            const conversao = totalGerados > 0 ? (ganhos.length / totalGerados) * 100 : 0;
            const faturamento = ganhos.reduce((s, l) => s + Number(l.valor_total || 0), 0);

            const tipoConfig: Record<string, { label: string; color: string; bg: string; keywords: string[] }> = {
              resgate: { label: 'Resgate de Inativos', color: 'text-purple-400', bg: 'bg-purple-600/20 border-purple-500/30', keywords: ['resgate', 'inativo', 'recupera'] },
              churn: { label: 'Prevenção de Perda', color: 'text-orange-400', bg: 'bg-orange-600/20 border-orange-500/30', keywords: ['churn', 'perda', 'risco'] },
              mix: { label: 'Primeira Compra', color: 'text-green-400', bg: 'bg-green-600/20 border-green-500/30', keywords: ['primeira', 'mix', 'novo'] },
            };

            const porTipo = Object.entries(tipoConfig).map(([key, cfg]) => {
              const leads = rawLeadsIA.filter(l =>
                cfg.keywords.some(kw => (l.origem || '').toLowerCase().includes(kw) || (l.descricao || '').toLowerCase().includes(kw))
              );
              const g = leads.filter(l => l.status === 'ganho');
              return { key, ...cfg, total: leads.length, ganhos: g.length, conv: leads.length > 0 ? (g.length / leads.length) * 100 : 0, fat: g.reduce((s, l) => s + Number(l.valor_total || 0), 0) };
            });

            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Leads Gerados', value: totalGerados, color: 'text-purple-400', suffix: '' },
                    { label: 'Convertidos', value: ganhos.length, color: 'text-[#22C55E]', suffix: '' },
                    { label: 'Taxa de Conversão', value: conversao.toFixed(1), color: 'text-blue-400', suffix: '%' },
                    { label: 'Faturamento Gerado', value: `R$ ${(faturamento/1000).toFixed(0)}k`, color: 'text-yellow-400', suffix: '' },
                  ].map((kpi, i) => (
                    <div key={i} className="bg-[#0F172A] border border-white/5 p-4 rounded-3xl">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{kpi.label}</p>
                      <p className={`text-2xl font-black italic ${kpi.color}`}>{kpi.value}{kpi.suffix}</p>
                    </div>
                  ))}
                </div>

                {/* Por tipo de algoritmo */}
                <div className="bg-[#0F172A] border border-white/5 rounded-[32px] p-6">
                  <h3 className="text-white font-black uppercase italic mb-5 flex items-center gap-2">
                    <BarChart3 size={16} className="text-purple-400"/> Conversão por Algoritmo
                  </h3>
                  <div className="space-y-4">
                    {porTipo.map(t => (
                      <div key={t.key}>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-[10px] font-black uppercase ${t.color}`}>{t.label}</span>
                          <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400">
                            <span>{t.total} leads</span>
                            <span className={t.color}>{t.ganhos} ganhos</span>
                            <span className="font-black text-white">{t.conv.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${t.key === 'resgate' ? 'bg-purple-500' : t.key === 'churn' ? 'bg-orange-500' : 'bg-green-500'}`} style={{ width: `${Math.min(t.conv, 100)}%` }} />
                        </div>
                        {t.fat > 0 && <p className="text-[9px] text-slate-600 mt-0.5">R$ {t.fat.toLocaleString('pt-BR', {maximumFractionDigits: 0})} faturados</p>}
                      </div>
                    ))}
                    {rawLeadsIA.length === 0 && (
                      <p className="text-slate-600 text-xs font-bold text-center py-4 uppercase">Nenhum lead de IA registrado ainda.</p>
                    )}
                  </div>
                </div>

                {/* Ordens recentes compactas */}
                <div className="bg-[#0F172A] border border-white/5 rounded-[32px] p-6">
                  <h3 className="text-white font-black uppercase italic mb-4 flex items-center gap-2">
                    <Clock size={16} className="text-slate-500"/> Campanhas Recentes
                  </h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {premissas.length === 0 ? (
                      <div className="text-center py-8 text-slate-600 text-xs font-black uppercase">A aguardar comando</div>
                    ) : premissas.map((p) => {
                      const leadsVinc = rawLeadsIA.filter(l =>
                        (l.origem || '').toLowerCase().includes((p.titulo || '').toLowerCase().substring(0, 10))
                      );
                      const ganhosVinc = leadsVinc.filter(l => l.status === 'ganho');
                      const convVinc = leadsVinc.length > 0 ? Math.round((ganhosVinc.length / leadsVinc.length) * 100) : 0;
                      return (
                        <div key={p.id} className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0 ${p.tipo_cliente === 'Recuperação' ? 'bg-purple-600/20 text-purple-400' : 'bg-blue-600/20 text-blue-400'}`}>
                              {p.quantidade}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-white font-black text-xs uppercase italic truncate">{p.titulo}</h4>
                              <span className="text-[9px] text-slate-500 font-bold uppercase">{vendedores.find(v => v.id === p.user_id)?.nome || 'Equipe'} · {new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className={`text-sm font-black ${convVinc > 0 ? 'text-[#22C55E]' : 'text-slate-500'}`}>{convVinc}%</p>
                            <p className="text-[9px] text-slate-600 uppercase">{ganhosVinc.length}/{leadsVinc.length || p.quantidade}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

      </div>
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}