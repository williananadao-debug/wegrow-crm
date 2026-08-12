"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, MapPin, Calendar, ListChecks, Users, Receipt, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../useObrasAccess';
import { Obra, ObraEtapa, Medicao, OBRA_STATUS_LABELS, OBRA_STATUS_CORES, fmtMoeda, fmtData, formatObraId } from '../shared';

export default function ObraDetalhePage() {
  const { obraId } = useParams<{ obraId: string }>();
  const { authLoading, perfil, temObras } = useObrasAccess();

  const [obra, setObra] = useState<Obra | null>(null);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id || !obraId) return;
    setLoading(true);
    Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('obra_etapas').select('*').eq('obra_id', obraId).order('ordem', { ascending: true }),
      supabase.from('medicoes').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }).limit(5),
    ]).then(([obraRes, etapasRes, medicoesRes]) => {
      setObra(obraRes.data as Obra);
      setEtapas((etapasRes.data as ObraEtapa[]) || []);
      setMedicoes((medicoesRes.data as Medicao[]) || []);
      setLoading(false);
    });
  }, [perfil?.empresa_id, obraId]);

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

  if (!obra) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <p className="text-slate-400 font-bold text-sm">Obra não encontrada.</p>
        </div>
      </div>
    );
  }

  const percentualMedio = etapas.length > 0
    ? etapas.reduce((acc, e) => acc + Number(e.percentual_executado || 0), 0) / etapas.length
    : 0;

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <Link href="/obras" className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <header className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{formatObraId(obra.id)}</p>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
            {obra.nome}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${OBRA_STATUS_CORES[obra.status]}`}>
              {OBRA_STATUS_LABELS[obra.status]}
            </span>
            {obra.endereco && <span className="text-xs text-slate-400 flex items-center gap-1.5"><MapPin size={12} /> {obra.endereco}</span>}
            <span className="text-xs text-slate-400 flex items-center gap-1.5"><Calendar size={12} /> {fmtData(obra.data_inicio)} — {fmtData(obra.data_prevista_fim)}</span>
          </div>
        </div>
        {obra.valor_orcado_total ? (
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Orçamento Total</p>
            <p className="text-2xl font-black text-[#22C55E]">{fmtMoeda(obra.valor_orcado_total)}</p>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href={`/obras/${obra.id}/cronograma`} className="bg-[#0F172A] border border-white/10 hover:border-orange-500/40 rounded-2xl p-6 transition-all flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center"><ListChecks size={18} className="text-orange-400" /></div>
            <ChevronRight size={16} className="text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase">Cronograma</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{etapas.length} etapa(s)</p>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${Math.min(percentualMedio, 100)}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 font-bold">{Math.round(percentualMedio)}% executado (média das etapas)</p>
        </Link>

        <Link href={`/obras/${obra.id}/medicoes`} className="bg-[#0F172A] border border-white/10 hover:border-orange-500/40 rounded-2xl p-6 transition-all flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center"><Receipt size={18} className="text-blue-400" /></div>
            <ChevronRight size={16} className="text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase">Medições</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{medicoes.length} recente(s)</p>
          </div>
          <p className="text-[10px] text-slate-500 font-bold">
            {medicoes.filter(m => m.status === 'em_aprovacao').length} aguardando aprovação
          </p>
        </Link>

        <Link href={`/obras/${obra.id}/contratados`} className="bg-[#0F172A] border border-white/10 hover:border-orange-500/40 rounded-2xl p-6 transition-all flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 bg-[#22C55E]/10 rounded-xl flex items-center justify-center"><Users size={18} className="text-[#22C55E]" /></div>
            <ChevronRight size={16} className="text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase">Contratados</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Fornecedores e subempreiteiros</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
