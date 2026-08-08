"use client";
import { useState, useEffect } from 'react';
import { Loader2, Activity, Boxes, Package, Minus, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig } from '../shared';

export default function PulseEstoquePage() {
  const { authLoading, temPulse } = usePulseAccess();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(true);

  const fetchServicos = async () => {
    setLoadingServicos(true);
    const { data } = await supabase.from('servicos').select('*').order('nome', { ascending: true });
    if (data) setServicos(data as ServicoConfig[]);
    setLoadingServicos(false);
  };

  useEffect(() => { fetchServicos(); }, []);

  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);

  const ajustarEstoque = async (s: ServicoConfig, delta: number) => {
    const novo = Math.max(0, (s.estoque || 0) + delta);
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
          <Boxes size={32} /> Estoque
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Ajuste rápido — salva na hora</p>
      </header>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-black uppercase text-sm text-slate-300">Produtos com controle de estoque ({produtosComEstoque.length})</h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Pra cadastrar foto/preço ou ligar o controle num produto novo, vai em Configurações → Catálogo</p>
        </div>
        {loadingServicos ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : produtosComEstoque.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhum produto com estoque controlado ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {[...produtosComEstoque].sort((a, b) => (a.estoque as number) - (b.estoque as number)).map(s => {
              const baixo = (s.estoque as number) <= 5;
              return (
                <div key={s.id} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {s.imagem_url ? <img src={s.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-slate-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{s.nome}</p>
                    <p className="text-slate-500 text-[10px]">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <button onClick={() => ajustarEstoque(s, -1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Minus size={13} /></button>
                  <span className={`text-sm font-black w-10 text-center ${baixo ? 'text-red-400' : 'text-white'}`}>{s.estoque}</span>
                  <button onClick={() => ajustarEstoque(s, 1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Plus size={13} /></button>
                  {baixo && <span className="text-[9px] font-black text-red-400 uppercase ml-1">baixo</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
