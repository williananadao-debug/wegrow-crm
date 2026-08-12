"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, HardHat, Plus, MapPin, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from './useObrasAccess';
import { Obra, OBRA_STATUS_LABELS, OBRA_STATUS_CORES, fmtMoeda, fmtData, formatObraId } from './shared';

export default function ObrasPainelPage() {
  const { authLoading, perfil, temObras } = useObrasAccess();

  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    supabase.from('obras').select('*').eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setObras((data as Obra[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

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

  const emAndamento = obras.filter(o => o.status === 'em_andamento').length;
  const orcadoTotal = obras.reduce((acc, o) => acc + Number(o.valor_orcado_total || 0), 0);

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-orange-500 flex items-center gap-3">
            <HardHat size={32} /> Obras
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Cronograma, medições e contratados por obra</p>
        </div>
        <Link href="/obras/nova-obra" className="inline-flex items-center gap-2 bg-orange-500 text-[#0B1120] hover:scale-105 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all w-fit">
          <Plus size={14} /> Nova Obra
        </Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total de Obras</p>
          <p className="text-2xl font-black text-white">{obras.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Em Andamento</p>
          <p className="text-2xl font-black text-orange-400">{emAndamento}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-5 col-span-2 md:col-span-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Orçado Total</p>
          <p className="text-2xl font-black text-[#22C55E]">{fmtMoeda(orcadoTotal)}</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : obras.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <HardHat size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm mb-4">Nenhuma obra cadastrada ainda.</p>
          <Link href="/obras/nova-obra" className="inline-flex items-center gap-2 bg-orange-500 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest">
            <Plus size={14} /> Cadastrar primeira obra
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {obras.map(obra => (
            <Link key={obra.id} href={`/obras/${obra.id}`} className="bg-[#0F172A] border border-white/10 hover:border-orange-500/40 rounded-2xl p-5 transition-all flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{formatObraId(obra.id)}</p>
                  <h2 className="text-base font-black text-white leading-tight">{obra.nome}</h2>
                </div>
                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full border whitespace-nowrap ${OBRA_STATUS_CORES[obra.status]}`}>
                  {OBRA_STATUS_LABELS[obra.status]}
                </span>
              </div>
              {obra.endereco && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5"><MapPin size={12} className="flex-shrink-0" /> {obra.endereco}</p>
              )}
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mt-auto pt-2 border-t border-white/5">
                <span className="flex items-center gap-1.5"><Calendar size={12} /> {fmtData(obra.data_inicio)}</span>
                {obra.valor_orcado_total ? <span className="text-slate-300">{fmtMoeda(obra.valor_orcado_total)}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
