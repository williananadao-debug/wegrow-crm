"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, Plus, GripVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../../useObrasAccess';
import { Obra, ObraEtapa, ETAPA_STATUS_LABELS, fmtData } from '../../shared';

const STATUS_CORES: Record<ObraEtapa['status'], string> = {
  nao_iniciada: 'text-slate-400 bg-white/5 border-white/10',
  em_andamento: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  concluida: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
  atrasada: 'text-red-400 bg-red-500/10 border-red-500/20',
};

export default function CronogramaObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const { authLoading, perfil, temObras, isLideranca } = useObrasAccess();

  const [obra, setObra] = useState<Obra | null>(null);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaEtapa, setNovaEtapa] = useState('');
  const [salvandoNova, setSalvandoNova] = useState(false);

  const carregar = async () => {
    if (!perfil?.empresa_id || !obraId) return;
    setLoading(true);
    const [obraRes, etapasRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('obra_etapas').select('*').eq('obra_id', obraId).order('ordem', { ascending: true }),
    ]);
    setObra(obraRes.data as Obra);
    setEtapas((etapasRes.data as ObraEtapa[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id, obraId]);

  const adicionarEtapa = async () => {
    if (!novaEtapa.trim() || !perfil?.empresa_id) return;
    setSalvandoNova(true);
    await supabase.from('obra_etapas').insert([{
      obra_id: Number(obraId),
      empresa_id: perfil.empresa_id,
      nome: novaEtapa.trim(),
      ordem: etapas.length,
    }]);
    setNovaEtapa('');
    setSalvandoNova(false);
    carregar();
  };

  const atualizarEtapa = async (id: number, campos: Partial<ObraEtapa>) => {
    setEtapas(prev => prev.map(e => e.id === id ? { ...e, ...campos } : e));
    await supabase.from('obra_etapas').update(campos).eq('id', id);
  };

  if (authLoading || loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temObras) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <HardHat size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Obras não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <Link href={`/obras/${obraId}`} className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
      </Link>

      <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500 mb-1">Cronograma</h1>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6">% previsto e executado por etapa — atualização manual</p>

      <div className="space-y-3 mb-6">
        {etapas.length === 0 && (
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-slate-400 font-bold text-sm">Nenhuma etapa cadastrada ainda.</p>
          </div>
        )}
        {etapas.map(etapa => (
          <div key={etapa.id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <GripVertical size={16} className="text-slate-700 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-sm text-white truncate">{etapa.nome}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">
                    {fmtData(etapa.data_inicio_prevista)} — {fmtData(etapa.data_fim_prevista)}
                  </p>
                </div>
              </div>

              <select
                value={etapa.status}
                disabled={!isLideranca}
                onChange={e => atualizarEtapa(etapa.id, { status: e.target.value as ObraEtapa['status'] })}
                className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-full border outline-none flex-shrink-0 ${STATUS_CORES[etapa.status]}`}
              >
                {Object.entries(ETAPA_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#0F172A] text-white">{l}</option>
                ))}
              </select>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="w-32">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-1">% Previsto</p>
                  <input
                    type="number" min={0} max={100} defaultValue={etapa.percentual_previsto}
                    disabled={!isLideranca}
                    onBlur={e => atualizarEtapa(etapa.id, { percentual_previsto: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-orange-500"
                  />
                </div>
                <div className="w-32">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-1">% Executado</p>
                  <input
                    type="number" min={0} max={100} defaultValue={etapa.percentual_executado}
                    disabled={!isLideranca}
                    onBlur={e => atualizarEtapa(etapa.id, { percentual_executado: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-4">
              <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${Math.min(etapa.percentual_executado, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {isLideranca && (
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 flex gap-3">
          <input
            value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionarEtapa(); }}
            placeholder="Nome da nova etapa (ex: Fundação, Estrutura, Acabamento...)"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 transition-all"
          />
          <button onClick={adicionarEtapa} disabled={salvandoNova || !novaEtapa.trim()}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            {salvandoNova ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
