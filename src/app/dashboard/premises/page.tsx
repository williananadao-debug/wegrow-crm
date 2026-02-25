"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Target, Users, MapPin, Calendar, 
  CheckCircle2, Play, AlertCircle, Sparkles, Clock, TrendingUp 
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';

export default function PremisesPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [premissas, setPremissas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('ai');

  // Form Manual
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [quantidade, setQuantidade] = useState(5);
  const [regiao, setRegiao] = useState('');
  
  // Form IA
  const [diasInativo, setDiasInativo] = useState(60);

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
    const { data } = await supabase.from('premissas').select('*, profiles:user_id(nome)').order('created_at', { ascending: false });
    setPremissas(data || []);
  };

  const gerarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supabase.from('premissas').insert([{
        titulo: `Prospecção ${regiao}`,
        quantidade, regiao, tipo_cliente: 'Anunciante',
        user_id: selectedVendedor, criado_por: user.id,
        empresa_id: perfil?.empresa_id // 👈 CARIMBO SAAS
      }]);

      const leads = Array.from({ length: Number(quantidade) }).map((_, i) => ({
        empresa: `🎯 Visita #${i + 1}: ${regiao}`,
        tipo: 'Anunciante', status: 'aberto', etapa: 0,
        user_id: selectedVendedor, checkin: 'Meta de Prospecção',
        empresa_id: perfil?.empresa_id // 👈 CARIMBO SAAS
      }));
      await supabase.from('leads').insert(leads);

      setToastMessage(`✅ ${quantidade} visitas geradas manualmente.`);
      setShowToast(true);
      fetchHistorico();
    } catch (err) { alert("Erro ao gerar"); }
    setLoading(false);
  };

  const gerarInteligente = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Nota: Como é RPC, ele roda no banco. Se o script RPC não tiver empresa_id, precisa ser atualizado depois. 
      // Mas para a segurança do painel atual, a política RLS já bloqueia vazamentos.
      const { data, error } = await supabase.rpc('gerar_premissas_inteligentes', {
        dias_sem_compra: diasInativo,
        vendedor_alvo: selectedVendedor || null, 
        criado_por_id: user.id
      });

      if (error) throw error;

      if (data && data.length > 0) {
          const { leads_criados, produto_sugerido } = data[0];
          setToastMessage(`🤖 ${leads_criados} Oportunidades de Resgate criadas! Sugestão: ${produto_sugerido}`);
      } else {
          setToastMessage("Nenhum cliente se encaixou nesses critérios hoje.");
      }
      
      setShowToast(true);
      fetchHistorico();

    } catch (err) { 
        console.error(err);
        alert("Erro ao processar inteligência."); 
    }
    setLoading(false);
  };

  if (!isDirector) return <div className="p-10 text-white text-center">Acesso Restrito</div>;

  return (
    <div className="p-6 space-y-6 pb-20 animate-in fade-in duration-500">
      
      <div>
        <h1 className="text-2xl font-black uppercase italic text-white tracking-tighter">Central de Estratégia</h1>
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
           Defina o ritmo de vendas da equipe
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUNA 1: CONFIGURADOR */}
        <div className="lg:col-span-1">
          <div className="bg-[#0B1120] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            
            {/* ABAS */}
            <div className="flex border-b border-white/10">
                <button onClick={() => setActiveTab('ai')} className={`flex-1 py-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'ai' ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-white'}`}>
                    <Sparkles size={14}/> Inteligência
                </button>
                <button onClick={() => setActiveTab('manual')} className={`flex-1 py-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'manual' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-white'}`}>
                    <Target size={14}/> Manual
                </button>
            </div>

            <div className="p-6 relative">
              
              {/* FORMULÁRIO IA */}
              {activeTab === 'ai' && (
                  <form onSubmit={gerarInteligente} className="space-y-4">
                      <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl mb-4">
                          <h3 className="text-purple-400 font-bold text-xs uppercase mb-1 flex items-center gap-2"><TrendingUp size={14}/> Como funciona:</h3>
                          <p className="text-[10px] text-slate-300 leading-relaxed">
                              O sistema varre sua carteira de clientes ativos, identifica quem não compra há mais de <strong>{diasInativo} dias</strong>, analisa o perfil de compra global e gera leads automaticamente com o <strong>produto ideal</strong> já sugerido.
                          </p>
                      </div>

                      <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Vendedor (Opcional)</label>
                          <select className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm outline-none" value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)}>
                              <option value="" className="bg-[#0B1120]">Toda a Equipe (Distribuir)</option>
                              {vendedores.map(v => <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>)}
                          </select>
                      </div>

                      <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Tempo sem Compras (Dias)</label>
                          <div className="relative">
                              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                              <input type="number" min="30" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none focus:border-purple-500" value={diasInativo} onChange={e => setDiasInativo(Number(e.target.value))} />
                          </div>
                      </div>

                      <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 mt-4">
                          {loading ? <Clock className="animate-spin" size={16}/> : <><Sparkles size={16}/> Gerar Oportunidades</>}
                      </button>
                  </form>
              )}

              {/* FORMULÁRIO MANUAL */}
              {activeTab === 'manual' && (
                  <form onSubmit={gerarManual} className="space-y-4">
                      <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Vendedor Alvo</label>
                          <select className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm outline-none" value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} required>
                              <option value="" className="bg-[#0B1120]">Selecione...</option>
                              {vendedores.map(v => <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>)}
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Qtd. Visitas</label>
                              <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500" value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} />
                          </div>
                          <div>
                              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Região</label>
                              <input type="text" placeholder="Ex: Centro" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500" value={regiao} onChange={e => setRegiao(e.target.value)} />
                          </div>
                      </div>
                      <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 mt-4">
                          {loading ? 'Gerando...' : <><Play size={16}/> Disparar Manualmente</>}
                      </button>
                  </form>
              )}
            </div>
          </div>
        </div>

        {/* COLUNA 2: HISTÓRICO */}
        <div className="lg:col-span-2">
          <div className="bg-[#0B1120] border border-white/5 rounded-3xl p-6 h-full">
            <h3 className="text-white font-black uppercase italic mb-6 flex items-center gap-2">
              <Calendar className="text-slate-500" size={18} /> Histórico de Estratégias
            </h3>
            <div className="space-y-3">
              {premissas.length === 0 ? (
                <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase">Nenhuma estratégia executada.</div>
              ) : (
                premissas.map((p) => (
                  <div key={p.id} className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-white/10 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${p.tipo_cliente === 'Recuperação' ? 'bg-purple-600/10 text-purple-400' : 'bg-blue-600/10 text-blue-400'}`}>
                        {p.quantidade}
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-sm uppercase">{p.titulo}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                            <Users size={10} /> {p.profiles?.nome || 'Equipe'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                            {p.tipo_cliente === 'Recuperação' ? <Sparkles size={10} className="text-purple-500"/> : <MapPin size={10} />}
                            {p.tipo_cliente === 'Recuperação' ? 'Inteligência Artificial' : p.regiao}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] text-[#22C55E] bg-[#22C55E]/10 px-2 py-1 rounded font-black uppercase flex items-center gap-1">
                         <CheckCircle2 size={10} /> Executado
                       </span>
                       <p className="text-[9px] text-slate-600 mt-1 font-mono">
                         {new Date(p.created_at).toLocaleDateString('pt-BR')}
                       </p>
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