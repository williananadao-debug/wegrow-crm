"use client";
  
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { 
  Target, TrendingUp, Users, DollarSign, 
  Award, ArrowUpRight, CheckCircle2, Settings, X, Save, RefreshCw
} from 'lucide-react';
import { Toast } from '@/components/Toast'; // <--- IMPORTADO

// Tipagem estrita para melhor performance do compilador
type VendedorMeta = {
  user_id: string;
  nome: string;
  meta_atual: number;
  realizado: number;
};

export default function GoalsPage() {
  const { perfil } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [rawMetas, setRawMetas] = useState<any[]>([]);
  const [rawUsuarios, setRawUsuarios] = useState<any[]>([]);

  // Estados do Modal
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [metasEditaveis, setMetasEditaveis] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Estados do Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Datas fixas (Memoizadas para não recriar a cada render)
  const { mesAtual, anoAtual, inicioMes, fimMes } = useMemo(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    return {
      mesAtual: mes,
      anoAtual: ano,
      inicioMes: new Date(ano, mes - 1, 1).toISOString(),
      fimMes: new Date(ano, mes, 0, 23, 59, 59).toISOString()
    };
  }, []);

  const podeEditar = useMemo(() => 
    ['gerente', 'diretor', 'admin'].includes((perfil?.cargo as string) || ''), 
  [perfil]);

  useEffect(() => {
    fetchDadosOtimizado();
  }, [inicioMes, fimMes]);

  async function fetchDadosOtimizado() {
    setLoading(true);
    try {
        // PARALELISMO: Dispara as 3 requisições simultaneamente
        const [leadsRes, metasRes, usersRes] = await Promise.all([
            // 1. Leads
            supabase
                .from('leads')
                .select('valor_total, user_id, perfis(nome)')
                .eq('status', 'ganho')
                .gte('created_at', inicioMes)
                .lte('created_at', fimMes),
            
            // 2. Metas
            supabase
                .from('metas')
                .select('user_id, valor')
                .eq('mes', mesAtual)
                .eq('ano', anoAtual),

            // 3. Usuários
            supabase
                .from('perfis')
                .select('id, nome, cargo')
        ]);

        if (leadsRes.error) console.error("Erro Leads:", leadsRes.error);
        if (metasRes.error) console.error("Erro Metas:", metasRes.error);
        
        // Salva os dados brutos e deixa o useMemo processar
        setRawLeads(leadsRes.data || []);
        setRawMetas(metasRes.data || []);
        setRawUsuarios(usersRes.data || []);

        // Prepara o modal apenas se necessário
        if (usersRes.data && metasRes.data) {
             const mapaInicial = (metasRes.data).reduce((acc: any, m) => {
                acc[m.user_id] = Number(m.valor);
                return acc;
            }, {});
            setMetasEditaveis(mapaInicial);
        }

    } catch (error) {
        console.error("Erro crítico:", error);
    } finally {
        setLoading(false);
    }
  }

  // CÁLCULOS MEMOIZADOS (Só rodam quando os dados mudam, não quando abre modal)
  const { ranking, totalRealizado, metaGlobal, totalVendas, percentualGlobal } = useMemo(() => {
    if (!rawUsuarios.length) return { ranking: [], totalRealizado: 0, metaGlobal: 1, totalVendas: 0, percentualGlobal: 0 };

    // Mapas de busca rápida (Hash Maps)
    const mapaMetas = rawMetas.reduce((acc: Record<string, number>, m) => {
        acc[m.user_id] = Number(m.valor);
        return acc;
    }, {});

    const mapaVendas = rawLeads.reduce((acc: Record<string, number>, l) => {
        acc[l.user_id] = (acc[l.user_id] || 0) + Number(l.valor_total);
        return acc;
    }, {});

    // Ranking
    const rank = rawUsuarios.map(u => ({
        user_id: u.id,
        nome: u.nome || 'Desconhecido',
        meta_atual: mapaMetas[u.id] || 0,
        realizado: mapaVendas[u.id] || 0
    })).sort((a, b) => b.realizado - a.realizado);

    // Totais
    const totalR = rawLeads.reduce((acc, curr) => acc + Number(curr.valor_total), 0);
    const totalM = Object.values(mapaMetas).reduce((acc, curr) => acc + curr, 0);
    const safeTotalM = totalM > 0 ? totalM : 1;
    
    return {
        ranking: rank,
        totalRealizado: totalR,
        metaGlobal: safeTotalM,
        totalVendas: rawLeads.length,
        percentualGlobal: Math.min((totalR / safeTotalM) * 100, 100)
    };
  }, [rawLeads, rawMetas, rawUsuarios]);

  const salvarMetas = async () => {
    setSaving(true);
    try {
        const updates = Object.entries(metasEditaveis).map(([userId, valor]) => ({
            user_id: userId,
            mes: mesAtual,
            ano: anoAtual,
            valor: valor
        }));

        const { error } = await supabase.from('metas').upsert(updates, { onConflict: 'user_id,mes,ano' });
        
        if (!error) {
            setToastMessage("Metas salvas com sucesso! 🚀"); // Define mensagem
            setShowToast(true); // Mostra Toast
            setIsConfigOpen(false);
            fetchDadosOtimizado();
        } else {
            throw error;
        }
    } catch (error: any) {
        alert("Erro ao salvar: " + error.message); // Mantive alert só para erro crítico
    } finally {
        setSaving(false);
    }
  };

  // RENDERIZAÇÃO
  if (loading && !rawUsuarios.length) {
    return (
        <div className="p-6 space-y-6 animate-pulse">
            <div className="h-8 w-48 bg-white/5 rounded-lg"></div>
            <div className="h-40 w-full bg-white/5 rounded-[32px]"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 h-96 bg-white/5 rounded-[32px]"></div>
                <div className="h-96 bg-white/5 rounded-[32px]"></div>
            </div>
        </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black uppercase italic text-white flex items-center gap-3">
            <Target className="text-[#22C55E]" size={28} /> Painel de Metas
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            {new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        
        {podeEditar && (
          <button 
            onClick={() => setIsConfigOpen(true)}
            className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-xl flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all border border-white/10 active:scale-95"
          >
            <Settings size={14} /> Configurar
          </button>
        )}
      </header>

      {/* CARD DA META GLOBAL */}
      <div className="bg-gradient-to-br from-blue-900/40 to-[#0B1120] border border-blue-500/30 rounded-[32px] p-6 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all duration-700"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
            <div>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">Faturamento Mês</p>
              <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter">
                R$ {totalRealizado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </h2>
            </div>
            <div className="text-right w-full md:w-auto">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Meta da Empresa</p>
              <p className="text-xl font-bold text-white">R$ {metaGlobal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          <div className="relative w-full h-6 bg-[#0F172A] rounded-full mb-2 p-1 shadow-inner border border-white/5">
             <div className="absolute top-0 left-0 h-full w-full flex items-center justify-center z-20 pointer-events-none">
                <span className="text-[10px] font-black text-white drop-shadow-md">{percentualGlobal.toFixed(1)}%</span>
             </div>
            <div 
              className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(59,130,246,0.5)] ${percentualGlobal >= 100 ? 'bg-[#22C55E]' : 'bg-gradient-to-r from-blue-600 to-cyan-400'}`}
              style={{ width: `${percentualGlobal}%` }}
            />
          </div>
          
          <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mt-2">
             <span className="flex items-center gap-1"><ArrowUpRight size={12}/> Performance</span>
             <span>Falta: R$ {Math.max(metaGlobal - totalRealizado, 0).toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 rounded-[32px] p-6">
          <h3 className="text-sm font-black uppercase text-white mb-6 flex items-center gap-2">
            <Award className="text-yellow-500" size={18} /> Ranking de Performance
          </h3>
          
          <div className="space-y-6">
            {ranking.map((vend, idx) => {
               const metaIndividual = vend.meta_atual > 0 ? vend.meta_atual : 1;
               const pct = Math.min((vend.realizado / metaIndividual) * 100, 100);
               
               return (
                <div key={vend.user_id} className="group">
                  <div className="flex items-end justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px] ${idx === 0 ? 'bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-white/10 text-slate-400'}`}>
                        {idx + 1}
                      </div>
                      <div>
                          <p className="text-sm font-bold text-white leading-none">{vend.nome}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Meta: {vend.meta_atual.toLocaleString('pt-BR', { notation: "compact" })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-white">R$ {vend.realizado.toLocaleString('pt-BR')}</p>
                      <p className={`text-[9px] font-bold ${pct >= 100 ? 'text-[#22C55E]' : 'text-blue-400'}`}>{pct.toFixed(0)}%</p>
                    </div>
                  </div>
                  
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative">
                    <div 
                        className={`h-full rounded-full transition-all duration-1000 ${pct >= 100 ? 'bg-[#22C55E]' : 'bg-blue-500'}`} 
                        style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
              );
            })}

            {ranking.length === 0 && (
                <p className="text-center text-slate-600 text-xs py-10">Nenhuma venda encontrada.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-white/5 rounded-[24px] p-5 flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
            <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contratos</p>
              <p className="text-2xl font-black text-white">{totalVendas}</p>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-[24px] p-5 flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ticket Médio</p>
              <p className="text-2xl font-black text-white">
                R$ {totalVendas > 0 ? (totalRealizado / totalVendas).toLocaleString('pt-BR', { notation: "compact" }) : 0}
              </p>
            </div>
          </div>

           <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-[24px] p-5">
              <p className="text-[#22C55E] text-[10px] font-black uppercase mb-2">Dica do Mês</p>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  Faltam <strong className="text-white">{Math.max(metaGlobal - totalRealizado, 0).toLocaleString('pt-BR', { notation: "compact" })}</strong> para a meta global. Foque nos leads em "Negociação" para fechar o gap até sexta-feira!
              </p>
           </div>
        </div>
      </div>

      {isConfigOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-white/10 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
                
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-lg font-black text-white uppercase italic">Configurar Metas</h2>
                    <button onClick={() => setIsConfigOpen(false)} className="text-slate-500 hover:text-white"><X size={20}/></button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-4 flex-1">
                    <p className="text-xs text-slate-400 mb-2">Defina a meta individual para o mês de <strong>{new Date().toLocaleString('pt-BR', { month: 'long' })}</strong>.</p>
                    
                    {rawUsuarios.map(user => (
                        <div key={user.id} className="flex items-center gap-4 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center font-bold text-slate-300">
                                {user.nome?.charAt(0) || 'U'}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-white">{user.nome}</p>
                                <p className="text-[10px] text-slate-500 uppercase">{user.cargo || 'Consultor'}</p>
                            </div>
                            <div className="relative w-32">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">R$</span>
                                <input 
                                    type="number" 
                                    className="w-full bg-[#0B1120] border border-white/10 rounded-lg py-2 pl-8 pr-2 text-white text-sm font-bold outline-none focus:border-[#22C55E]"
                                    value={metasEditaveis[user.id] || ''}
                                    placeholder="0"
                                    onChange={(e) => setMetasEditaveis(prev => ({ ...prev, [user.id]: Number(e.target.value) }))}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-white/10 bg-[#0F172A] rounded-b-3xl">
                    <button 
                        onClick={salvarMetas} 
                        disabled={saving}
                        className="w-full bg-[#22C55E] hover:bg-[#1ea850] text-[#0F172A] py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                        {saving ? 'Salvando...' : <><Save size={16} /> Salvar Metas</>}
                    </button>
                </div>

            </div>
        </div>
      )}

      {/* COMPONENTE DE NOTIFICAÇÃO (TOAST) */}
      <Toast 
        message={toastMessage} 
        isVisible={showToast} 
        onClose={() => setShowToast(false)} 
      />

    </div>
  );
}