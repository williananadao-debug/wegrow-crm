"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { 
  Target, Users, RefreshCcw, 
  ChevronRight, User as UserIcon, Loader2, Calendar, TrendingUp 
} from 'lucide-react';
import { Toast } from '@/components/Toast';

export default function GoalsPage() {
  const auth = useAuth() || {};
const user = auth.user;
const perfil = auth.perfil;
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>('global');
  
  // NAVEGAÇÃO DE PERÍODO
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [mesAtualVisual] = useState(new Date().getMonth() + 1);
  
  const [metaAno, setMetaAno] = useState(0);
  const [metasMensais, setMetasMensais] = useState<any[]>([]);
  const [realizadoAno, setRealizadoAno] = useState(0);
  const [realizadoMensalMap, setRealizadoMensalMap] = useState<Record<number, number>>({});

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    if (user) {
      fetchVendedores();
      // Vendedor comum só vê a própria meta
      if (!isDirector) setVendedorSelecionado(user.id);
    }
  }, [user, perfil]);

  useEffect(() => {
    if (user && vendedorSelecionado) fetchMetasERealizado();
  }, [vendedorSelecionado, anoFiltro]);

  async function fetchVendedores() {
    const { data } = await supabase.from('profiles').select('id, nome').neq('cargo', 'diretor');
    setVendedores(data || []);
  }

  async function fetchMetasERealizado() {
    setLoading(true);
    try {
      const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;

      // 1. Busca Metas do Ano Selecionado
      let metaQuery = supabase.from('metas').select('*').eq('ano', anoFiltro);
      if (targetUser) metaQuery = metaQuery.eq('user_id', targetUser);
      else metaQuery = metaQuery.is('user_id', null);

      const { data: metasData } = await metaQuery;
      setMetaAno(metasData?.find(m => m.mes === null)?.valor_objetivo || 0);
      setMetasMensais(metasData?.filter(m => m.mes !== null) || []);

      // 2. Busca Realizado (Vendas Ganhas) no Período
      let vendasQuery = supabase.from('leads')
        .select('valor_total, created_at')
        .eq('status', 'ganho')
        .gte('created_at', `${anoFiltro}-01-01`)
        .lte('created_at', `${anoFiltro}-12-31`);

      if (targetUser) vendasQuery = vendasQuery.eq('user_id', targetUser);

      const { data: vendas } = await vendasQuery;
      
      const totalAno = vendas?.reduce((acc, v) => acc + Number(v.valor_total), 0) || 0;
      setRealizadoAno(totalAno);

      const mensalMap: Record<number, number> = {};
      vendas?.forEach(v => {
        const mesVenda = new Date(v.created_at).getMonth() + 1;
        mensalMap[mesVenda] = (mensalMap[mesVenda] || 0) + Number(v.valor_total);
      });
      setRealizadoMensalMap(mensalMap);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateMeta = async (mes: number | null, valor: number) => {
    if (!isDirector) return;
    const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;

    // UPSERT: Garante que o registro seja criado ou atualizado
    const { error } = await supabase.from('metas').upsert({
      user_id: targetUser, 
      ano: anoFiltro,
      mes: mes,
      valor_objetivo: Number(valor),
      tipo: 'faturamento'
    }, { onConflict: 'user_id,ano,mes' });

    if (!error) {
      setToastMessage("Meta salva com sucesso! 🚀");
      setShowToast(true);
      fetchMetasERealizado(); // Recarrega para atualizar os gráficos
    } else {
      console.error("Erro ao salvar:", error.message);
      alert(`Erro no banco: ${error.message}`);
    }
  };

  const distribuirMetaAno = async () => {
    if (!metaAno || metaAno <= 0) return;
    if (!confirm(`Dividir R$ ${metaAno.toLocaleString()} igualmente entre os 12 meses?`)) return;

    const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;
    const valorMensal = metaAno / 12;
    const novasMetas = Array.from({ length: 12 }).map((_, i) => ({
      user_id: targetUser,
      ano: anoFiltro,
      mes: i + 1,
      valor_objetivo: valorMensal,
      tipo: 'faturamento'
    }));

    await supabase.from('metas').upsert(novasMetas, { onConflict: 'user_id,ano,mes' });
    setToastMessage("Meta anual distribuída!");
    setShowToast(true);
    fetchMetasERealizado();
  };

  const percentAno = metaAno > 0 ? (realizadoAno / metaAno) * 100 : 0;

  return (
    <div className="p-6 space-y-8 pb-20 animate-in fade-in duration-500">
      
      {/* SELETORES SUPERIORES */}
      <div className="flex flex-col md:flex-row justify-between gap-4">
          {/* Seletor de Perfil (Só Diretor) */}
          {isDirector && (
            <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar flex-1">
              <button onClick={() => setVendedorSelecionado('global')} className={`px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${vendedorSelecionado === 'global' ? 'bg-white text-black' : 'bg-white/5 text-slate-500 hover:border-white/20'}`}>Global Empresa</button>
              {vendedores.map(v => (
                <button key={v.id} onClick={() => setVendedorSelecionado(v.id)} className={`px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border flex items-center gap-2 ${vendedorSelecionado === v.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-slate-500 hover:border-white/20'}`}><UserIcon size={12} /> {v.nome}</button>
              ))}
            </div>
          )}

          {/* Seletor de Ano */}
          <div className="flex items-center bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-2 gap-3">
              <Calendar size={16} className="text-slate-500"/>
              <select className="bg-transparent text-white font-black text-[10px] outline-none cursor-pointer uppercase" value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a} className="bg-[#0B1120]">{a}</option>)}
              </select>
          </div>
      </div>

      {/* HEADER DINÂMICO */}
      <div className="bg-[#0B1120] border border-white/10 rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#22C55E]/10 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">
              {vendedorSelecionado === 'global' ? 'Planejamento Global' : `Foco: ${vendedores.find(v => v.id === vendedorSelecionado)?.nome}`}
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Ano Fiscal {anoFiltro}</p>
          </div>

          <div className="flex flex-col items-end">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Definir Meta do Ano</p>
            <div className="flex items-center gap-3">
              {isDirector && (
                <button onClick={distribuirMetaAno} className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><RefreshCcw size={16}/></button>
              )}
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus-within:border-[#22C55E]">
                <span className="text-slate-500 font-bold mr-2 text-sm">R$</span>
                <input 
                  type="number" 
                  className="bg-transparent text-2xl font-black text-white text-right outline-none w-40" 
                  value={metaAno} 
                  onChange={(e) => setMetaAno(Number(e.target.value))}
                  onBlur={(e) => handleUpdateMeta(null, Number(e.target.value))}
                  disabled={!isDirector}
                />
              </div>
            </div>
          </div>
        </div>

        {/* PROGRESSO ANUAL */}
        <div className="mt-10">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-black text-white uppercase italic">Atingimento Acumulado</span>
            <span className={`text-2xl font-black ${percentAno >= 100 ? 'text-[#22C55E]' : 'text-blue-500'}`}>{Math.round(percentAno)}%</span>
          </div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
            <div className={`h-full transition-all duration-1000 rounded-full ${percentAno >= 100 ? 'bg-[#22C55E]' : 'bg-blue-600'}`} style={{ width: `${Math.min(percentAno, 100)}%` }} />
          </div>
          <div className="flex justify-between mt-3 text-[10px] font-bold uppercase">
             <div><span className="text-slate-500">Realizado:</span> <span className="text-white ml-1">R$ {realizadoAno.toLocaleString('pt-BR')}</span></div>
             <div><span className="text-slate-500">Falta para Meta:</span> <span className="text-red-400 ml-1">R$ {Math.max(0, metaAno - realizadoAno).toLocaleString('pt-BR')}</span></div>
          </div>
        </div>
      </div>

      {/* GRADE MENSAL */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#22C55E]" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(mes => {
              const mMeta = metasMensais.find(m => m.mes === mes)?.valor_objetivo || 0;
              const mReal = realizadoMensalMap[mes] || 0;
              const mPerc = mMeta > 0 ? (mReal / mMeta) * 100 : 0;
              const active = mes === mesAtualVisual && anoFiltro === new Date().getFullYear();

              return (
                <div key={mes} className={`bg-[#0B1120] border ${active ? 'border-blue-500/50 shadow-xl shadow-blue-500/5' : 'border-white/5'} p-5 rounded-[24px] hover:border-white/20 transition-all flex flex-col group`}>
                  <div className="flex justify-between mb-6">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black uppercase ${active ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400'}`}>
                      {new Date(0, mes - 1).toLocaleString('pt-BR', { month: 'short' })}
                    </span>
                    {mPerc >= 100 && <div className="bg-[#22C55E]/20 text-[#22C55E] text-[8px] font-black px-2 py-1 rounded-full uppercase">Meta Batida 🏆</div>}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Meta Mensal</p>
                      <div className="flex items-center gap-1 border-b border-white/5 focus-within:border-blue-500 transition-all">
                        <span className="text-slate-600 text-xs font-bold">R$</span>
                        <input 
                          type="number" 
                          className="bg-transparent text-lg font-black text-white outline-none py-1 w-full" 
                          defaultValue={mMeta} 
                          onBlur={(e) => handleUpdateMeta(mes, Number(e.target.value))}
                          disabled={!isDirector}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Realizado</p>
                      <p className="text-sm font-black text-[#22C55E]">R$ {mReal.toLocaleString('pt-BR')}</p>
                    </div>
                    
                    {/* Progress bar mensal */}
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                      <div className={`h-full transition-all duration-700 ${mPerc >= 100 ? 'bg-[#22C55E]' : 'bg-blue-500'}`} style={{ width: `${Math.min(mPerc, 100)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}