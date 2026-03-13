"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Target, Users, MapPin, Calendar, CheckCircle2, Play, AlertCircle, 
  Sparkles, Clock, TrendingUp, Zap, RefreshCcw, User, ShieldCheck 
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';

export default function PremisesPage() {
  const { user, perfil } = useAuth();
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [premissas, setPremissas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');

  // Estados da IA
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [tipoIA, setTipoIA] = useState<'resgate' | 'churn' | 'mix'>('resgate');
  const [diasInativo, setDiasInativo] = useState(60);
  const [produtoFoco, setProdutoFoco] = useState('SPOT 30"');
  const [quantidadeIA, setQuantidadeIA] = useState(5); 
  
  // Estados Manual
  const [quantidadeManual, setQuantidadeManual] = useState(5);
  const [regiao, setRegiao] = useState('');
  
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    if (user && isDirector) {
      fetchVendedores();
      fetchHistorico();
    }
  }, [user, isDirector]);

  const fetchVendedores = async () => {
    const { data } = await supabase.from('profiles').select('*').neq('cargo', 'diretor');
    setVendedores(data || []);
  };

  const fetchHistorico = async () => {
    // 👇 CORREÇÃO AQUI: Removida a requisição complexa que causava o erro no Supabase
    const { data, error } = await supabase.from('premissas').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) console.error("Erro ao puxar histórico:", error.message);
    setPremissas(data || []);
  };

  const gerarInteligente = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err: any) { alert("Erro na Inteligência: " + err.message); }
    setLoading(false);
  };

  const gerarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regiao) {
        alert("⚠️ ATENÇÃO: Preencha o campo Região (Ex: Centro) antes de disparar!");
        return;
    }
    if (!selectedVendedor) {
        alert("⚠️ ATENÇÃO: Selecione um vendedor na lista!");
        return;
    }

    setLoading(true);
    try {
      const { error: err1 } = await supabase.from('premissas').insert([{
        titulo: `Prospecção Manual: ${regiao}`, 
        quantidade: quantidadeManual, 
        regiao: regiao, 
        tipo_cliente: 'Anunciante',
        user_id: selectedVendedor, 
        criado_por: user.id, 
        empresa_id: perfil?.empresa_id
      }]);
      
      if (err1) throw new Error("Erro ao salvar histórico: " + err1.message);

      const leads = Array.from({ length: Number(quantidadeManual) }).map((_, i) => ({
        empresa: `🎯 Alvo: ${regiao} #${i + 1}`,
        tipo: 'Anunciante',
        status: 'aberto', 
        etapa: 0,
        user_id: selectedVendedor, 
        origem: 'Estratégia Manual',
        descricao: `Meta de prospecção gerada para a região ${regiao}`,
        empresa_id: perfil?.empresa_id
      }));

      const { error: err2 } = await supabase.from('leads').insert(leads);
      if (err2) throw new Error("Erro ao gerar leads: " + err2.message);

      setToastMessage(`✅ ${quantidadeManual} alvos enviados para o funil!`);
      setShowToast(true);
      setRegiao('');
      fetchHistorico();
    } catch (err: any) { 
        alert(err.message);
    }
    setLoading(false);
  };

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
        
        <div className="lg:col-span-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl">
            
            <div className="flex p-2 bg-[#0B1120]/50 m-4 rounded-2xl gap-2">
                <button onClick={() => setActiveTab('ai')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'ai' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                    <Sparkles size={14}/> Inteligência IA
                </button>
                <button onClick={() => setActiveTab('manual')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'manual' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                    <Target size={14}/> Manual
                </button>
            </div>

            <div className="p-8 pt-2">
              
              {activeTab === 'ai' && (
                <form onSubmit={gerarInteligente} className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-3 block">Tipo de Algoritmo</label>
                        <div className="grid grid-cols-1 gap-2">
                            <button type="button" onClick={() => setTipoIA('resgate')} className={`p-4 rounded-xl border text-left transition-all ${tipoIA === 'resgate' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                                <div className="flex items-center gap-2 font-black text-[11px] uppercase"><RefreshCcw size={14}/> Resgate de Inativos</div>
                                <p className="text-[9px] mt-1 opacity-70 italic">Copia os itens do último contrato para clientes ausentes.</p>
                            </button>
                            <button type="button" onClick={() => setTipoIA('churn')} className={`p-4 rounded-xl border text-left transition-all ${tipoIA === 'churn' ? 'bg-orange-600/20 border-orange-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                                <div className="flex items-center gap-2 font-black text-[11px] uppercase"><AlertCircle size={14}/> Prevenção de Perda</div>
                                <p className="text-[9px] mt-1 opacity-70 italic">Prepara a renovação idêntica para contratos vencendo.</p>
                            </button>
                            <button type="button" onClick={() => setTipoIA('mix')} className={`p-4 rounded-xl border text-left transition-all ${tipoIA === 'mix' ? 'bg-green-600/20 border-green-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                                <div className="flex items-center gap-2 font-black text-[11px] uppercase"><TrendingUp size={14}/> Primeira Compra</div>
                                <p className="text-[9px] mt-1 opacity-70 italic">Busca clientes sem histórico e sugere o Best-Seller.</p>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Vendedor Destino</label>
                            <select 
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none focus:border-purple-500 appearance-none cursor-pointer" 
                                value={selectedVendedor} 
                                onChange={e => setSelectedVendedor(e.target.value)}
                            >
                                <option value="" className="bg-[#0B1120]">Toda a Equipe (Geral)</option>
                                {vendedores.map(v => <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>)}
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

              {activeTab === 'manual' && (
                <form onSubmit={gerarManual} className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Vendedor Alvo</label>
                        <select className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none" value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} required>
                            <option value="">Selecione o Soldado...</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Qtd. Visitas</label>
                            <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none" value={quantidadeManual} onChange={e => setQuantidadeManual(Number(e.target.value))} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Região</label>
                            <input type="text" placeholder="Ex: Centro" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold outline-none" value={regiao} onChange={e => setRegiao(e.target.value)} />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-blue-900/40 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all">
                        {loading ? 'Processando...' : <><Play size={18}/> Disparar Campanha</>}
                    </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* HISTÓRICO */}
        <div className="lg:col-span-8">
           <div className="bg-[#0F172A] border border-white/5 rounded-[40px] p-8 h-full">
            <h3 className="text-white font-black uppercase italic mb-8 flex items-center gap-3">
              <Clock className="text-slate-500" size={20} /> Ordens Estratégicas Recentes
            </h3>
            
            <div className="space-y-4">
              {premissas.length === 0 ? (
                  <div className="text-center py-20 bg-white/5 rounded-[32px] border border-dashed border-white/10">
                      <Zap className="mx-auto text-slate-700 mb-4" size={40}/>
                      <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Aguardando comando</p>
                  </div>
              ) : (
                premissas.map((p) => (
                    <div key={p.id} className="bg-white/[0.03] border border-white/5 p-5 rounded-[28px] flex items-center justify-between hover:bg-white/[0.05] transition-all">
                      <div className="flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl ${p.tipo_cliente === 'Recuperação' ? 'bg-purple-600/20 text-purple-400' : 'bg-blue-600/20 text-blue-400'}`}>
                          {p.quantidade}
                        </div>
                        <div>
                          <h4 className="text-white font-black text-sm uppercase italic tracking-tight">{p.titulo}</h4>
                          <div className="flex items-center gap-4 mt-1">
                            {/* 👇 CORREÇÃO AQUI: Usa a lista de vendedores local em vez de buscar da DB que quebrou 👇 */}
                            <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1.5">
                                <User size={12}/> {vendedores.find(v => v.id === p.user_id)?.nome || 'Equipe'}
                            </span>
                            <span className="text-[10px] text-[#22C55E] font-black uppercase flex items-center gap-1.5"><ShieldCheck size={12}/> Executado</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[11px] text-white font-mono font-bold tracking-tighter">{new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
                         <p className="text-[9px] text-slate-500 uppercase font-black">ID: #{p.id.toString().slice(-4)}</p>
                      </div>
                    </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}