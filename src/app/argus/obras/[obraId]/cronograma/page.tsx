"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Plus, GripVertical } from 'lucide-react';
import ArgusTopNav from '../../../ArgusTopNav';
import { Obra, ObraEtapa, ETAPA_STATUS_LABELS, fmtData } from '@/app/obras/shared';

const STATUS_CORES: Record<ObraEtapa['status'], string> = {
  nao_iniciada: 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]',
  em_andamento: 'text-[#d9861c] bg-[#fdf0d4] border-[#f0d19a]',
  concluida: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
  atrasada: 'text-[#d63f3f] bg-[#fce8e8] border-[#f5c6c6]',
};

export default function ArgusCronogramaObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

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
      obra_id: Number(obraId), empresa_id: perfil.empresa_id, nome: novaEtapa.trim(), ordem: etapas.length,
    }]);
    setNovaEtapa('');
    setSalvandoNova(false);
    carregar();
  };

  const atualizarEtapa = async (id: number, campos: Partial<ObraEtapa>) => {
    setEtapas(prev => prev.map(e => e.id === id ? { ...e, ...campos } : e));
    await supabase.from('obra_etapas').update(campos).eq('id', id);
  };

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Link href={`/argus/obras/${obraId}`} className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
        </Link>

        <h1 className="text-2xl font-bold text-[#241c14] mb-1" style={{ fontFamily: 'var(--font-argus-serif)' }}>Cronograma</h1>
        <p className="text-[#9a958a] text-xs font-bold uppercase tracking-wide mb-6">% previsto e executado por etapa — atualização manual</p>

        <div className="space-y-3 mb-6">
          {etapas.length === 0 && (
            <div className="bg-white border border-[#e5e0d5] rounded-2xl p-8 text-center">
              <p className="text-[#6b6862] font-semibold text-sm">Nenhuma etapa cadastrada ainda.</p>
            </div>
          )}
          {etapas.map(etapa => (
            <div key={etapa.id} className="bg-white border border-[#e5e0d5] rounded-2xl p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <GripVertical size={16} className="text-[#d9d5c8] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#241c14] truncate">{etapa.nome}</p>
                    <p className="text-[12px] text-[#9a958a] font-bold uppercase">{fmtData(etapa.data_inicio_prevista)} — {fmtData(etapa.data_fim_prevista)}</p>
                  </div>
                </div>

                <select value={etapa.status} disabled={!isLideranca}
                  onChange={e => atualizarEtapa(etapa.id, { status: e.target.value as ObraEtapa['status'] })}
                  className={`text-[12px] font-bold uppercase px-2.5 py-1.5 rounded-full border outline-none flex-shrink-0 ${STATUS_CORES[etapa.status]}`}>
                  {Object.entries(ETAPA_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="w-32">
                    <p className="text-[11px] font-bold text-[#9a958a] uppercase mb-1">% Previsto</p>
                    <input type="number" min={0} max={100} defaultValue={etapa.percentual_previsto} disabled={!isLideranca}
                      onBlur={e => atualizarEtapa(etapa.id, { percentual_previsto: Number(e.target.value) })}
                      className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-[#d9861c]" />
                  </div>
                  <div className="w-32">
                    <p className="text-[11px] font-bold text-[#9a958a] uppercase mb-1">% Executado</p>
                    <input type="number" min={0} max={100} defaultValue={etapa.percentual_executado} disabled={!isLideranca}
                      onBlur={e => atualizarEtapa(etapa.id, { percentual_executado: Number(e.target.value) })}
                      className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-[#d9861c]" />
                  </div>
                </div>
              </div>
              <div className="w-full h-1.5 bg-[#f0ede6] rounded-full overflow-hidden mt-4">
                <div className="h-full bg-[#d9861c] rounded-full transition-all" style={{ width: `${Math.min(etapa.percentual_executado, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {isLideranca && (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4 flex gap-3 shadow-sm">
            <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') adicionarEtapa(); }}
              placeholder="Nome da nova etapa (ex: Fundação, Estrutura, Acabamento...)"
              className="flex-1 bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c] transition-all" />
            <button onClick={adicionarEtapa} disabled={salvandoNova || !novaEtapa.trim()}
              className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              {salvandoNova ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
