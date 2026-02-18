"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { 
  Target, Calendar, TrendingUp, Edit3, 
  CheckCircle2, AlertTriangle, Plus, ChevronRight,
  RefreshCcw, DollarSign
} from 'lucide-react';
import { Toast } from '@/components/Toast';

export default function GoalsPage() {
  const { user, perfil } = useAuth();
  const [loading, setLoading] = useState(true);
  const [anoAtual] = useState(new Date().getFullYear());
  const [mesAtual] = useState(new Date().getMonth() + 1);
  
  const [metaAno, setMetaAno] = useState(0);
  const [metasMensais, setMetasMensais] = useState<any[]>([]);
  const [realizadoAno, setRealizadoAno] = useState(0);
  const [realizadoMensalMap, setRealizadoMensalMap] = useState<Record<number, number>>({});

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    if (user) fetchMetasERealizado();
  }, [user]);

  async function fetchMetasERealizado() {
    setLoading(true);
    try {
      // 1. Busca Metas
      const { data: metasData } = await supabase
        .from('metas')
        .select('*')
        .eq('ano', anoAtual);

      const mAno = metasData?.find(m => m.mes === null)?.valor_objetivo || 0;
      setMetaAno(mAno);
      setMetasMensais(metasData?.filter(m => m.mes !== null) || []);

      // 2. Busca Realizado (Todos os ganhos do ano para processar localmente)
      const { data: vendas } = await supabase
        .from('leads')
        .select('valor_total, created_at')
        .eq('status', 'ganho')
        .gte('created_at', `${anoAtual}-01-01`)
        .lte('created_at', `${anoAtual}-12-31`);

      // Total do Ano
      const totalAno = vendas?.reduce((acc, v) => acc + Number(v.valor_total), 0) || 0;
      setRealizadoAno(totalAno);

      // Mapeamento por Mês
      const mensalMap: Record<number, number> = {};
      vendas?.forEach(v => {
        const mesVenda = new Date(v.created_at).getMonth() + 1;
        mensalMap[mesVenda] = (mensalMap[mesVenda] || 0) + Number(v.valor_total);
      });
      setRealizadoMensalMap(mensalMap);

    } finally {
      setLoading(false);
    }
  }

  const handleUpdateMeta = async (mes: number | null, valor: number) => {
    if (!isDirector) return;
    const { error } = await supabase.from('metas').upsert({
      user_id: null, 
      ano: anoAtual,
      mes: mes,
      valor_objetivo: valor
    }, { onConflict: 'user_id,ano,mes' });

    if (!error) {
      setToastMessage(mes === null ? "Meta anual atualizada!" : `Meta de ${new Date(0, mes-1).toLocaleString('pt-BR', {month: 'long'})} atualizada!`);
      setShowToast(true);
      fetchMetasERealizado();
    }
  };

  const distribuirMetaAno = async () => {
    if (!metaAno || metaAno <= 0) return alert("Defina uma meta anual primeiro.");
    if (!confirm(`Deseja dividir R$ ${metaAno.toLocaleString()} igualmente (R$ ${(metaAno/12).toLocaleString()}/mês)?`)) return;

    const valorMensal = metaAno / 12;
    const novasMetas = Array.from({ length: 12 }).map((_, i) => ({
      user_id: null,
      ano: anoAtual,
      mes: i + 1,
      valor_objetivo: valorMensal
    }));

    const { error } = await supabase.from('metas').upsert(novasMetas, { onConflict: 'user_id,ano,mes' });
    if (!error) {
      setToastMessage("Metas mensais distribuídas!");
      setShowToast(true);
      fetchMetasERealizado();
    }
  };

  const percentAno = metaAno > 0 ? (realizadoAno / metaAno) * 100 : 0;

  return (
    <div className="p-6 space-y-8 pb-20 animate-in fade-in duration-500">
      
      {/* HEADER E RESUMO ANUAL */}
      <div className="bg-[#0B1120] border border-white/10 rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#22C55E]/10 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3">
              <Target className="text-[#22C55E]" size={32} /> Planejamento {anoAtual}
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Gestão de performance anual e mensal</p>
          </div>

          <div className="flex flex-col items-end">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Meta Anual Global</p>
            <div className="flex items-center gap-3">
              {isDirector && (
                <button 
                  onClick={distribuirMetaAno}
                  className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                  title="Dividir meta anual pelos 12 meses"
                >
                  <RefreshCcw size={16} />
                </button>
              )}
              {isDirector ? (
                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus-within:border-[#22C55E] transition-all">
                  <span className="text-slate-500 font-bold mr-2 text-sm">R$</span>
                  <input 
                    type="number" 
                    className="bg-transparent text-2xl font-black text-white text-right outline-none w-40"
                    defaultValue={metaAno}
                    onBlur={(e) => handleUpdateMeta(null, Number(e.target.value))}
                  />
                </div>
              ) : (
                <h2 className="text-3xl font-black text-white italic">R$ {metaAno.toLocaleString()}</h2>
              )}
            </div>
          </div>
        </div>

        {/* PROGRESSO ANUAL */}
        <div className="mt-10">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-black text-white uppercase italic">Realizado Acumulado</span>
            <span className="text-2xl font-black text-[#22C55E]">{Math.round(percentAno)}%</span>
          </div>
          <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-[#22C55E] rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(percentAno, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-[10px] text-slate-500 font-bold uppercase">
              Faturado: <span className="text-white">R$ {realizadoAno.toLocaleString()}</span>
            </p>
            <p className="text-[10px] text-slate-500 font-bold uppercase">
              Faltam: <span className="text-red-400">R$ {Math.max(0, metaAno - realizadoAno).toLocaleString()}</span>
            </p>
          </div>
        </div>
      </div>

      {/* GRADE MENSAL */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(mes => {
          const metaMes = metasMensais.find(m => m.mes === mes)?.valor_objetivo || 0;
          const realizadoMes = realizadoMensalMap[mes] || 0;
          const isAtivo = mes === mesAtual;
          const percentMes = metaMes > 0 ? (realizadoMes / metaMes) * 100 : 0;

          return (
            <div key={mes} className={`bg-[#0B1120] border ${isAtivo ? 'border-[#22C55E]/50 shadow-xl' : 'border-white/5'} p-5 rounded-[24px] hover:border-white/20 transition-all flex flex-col group`}>
              <div className="flex justify-between items-start mb-6">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black uppercase transition-all ${isAtivo ? 'bg-[#22C55E] text-[#0B1120]' : 'bg-white/5 text-slate-400'}`}>
                  {new Date(0, mes - 1).toLocaleString('pt-BR', { month: 'short' })}
                </span>
                {isAtivo && (
                  <div className="animate-pulse bg-[#22C55E]/20 text-[#22C55E] text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest">
                    Em andamento
                  </div>
                )}
              </div>

              <div className="space-y-4 flex-1">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Objetivo</p>
                  {isDirector ? (
                    <div className="flex items-center gap-1 border-b border-white/5 focus-within:border-blue-500 transition-all">
                       <span className="text-slate-600 text-xs font-bold">R$</span>
                       <input 
                        type="number"
                        className="bg-transparent text-lg font-black text-white outline-none py-1 w-full"
                        defaultValue={metaMes}
                        onBlur={(e) => handleUpdateMeta(mes, Number(e.target.value))}
                      />
                    </div>
                  ) : (
                    <p className="text-lg font-black text-white italic">R$ {metaMes.toLocaleString()}</p>
                  )}
                </div>

                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Realizado</p>
                  <p className="text-sm font-black text-[#22C55E]">R$ {realizadoMes.toLocaleString()}</p>
                </div>

                {/* Termômetro Mensal */}
                <div className="pt-2">
                   <div className="flex justify-between text-[8px] font-black uppercase mb-1">
                      <span className="text-slate-600">Atingimento</span>
                      <span className={percentMes >= 100 ? 'text-[#22C55E]' : 'text-slate-400'}>{Math.round(percentMes)}%</span>
                   </div>
                   <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-700 ${percentMes >= 100 ? 'bg-[#22C55E]' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(percentMes, 100)}%` }}
                      />
                   </div>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <span className="text-[9px] font-bold text-slate-500 uppercase">Análise Mensal</span>
                 <ChevronRight size={14} className="text-[#22C55E]" />
              </div>
            </div>
          )
        })}
      </div>

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}