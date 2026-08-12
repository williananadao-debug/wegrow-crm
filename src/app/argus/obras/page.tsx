"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, HardHat, Plus, MapPin, Calendar } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { Obra, OBRA_STATUS_LABELS, OBRA_STATUS_CORES, fmtMoeda as fmtMoedaObra, fmtData as fmtDataObra, formatObraId } from '@/app/obras/shared';

export default function ArgusObrasPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('obras').select('*').eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setObras((data as Obra[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  const emAndamento = obras.filter(o => o.status === 'em_andamento').length;
  const orcadoTotal = obras.reduce((acc, o) => acc + Number(o.valor_orcado_total || 0), 0);

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#241c14] flex items-center gap-2" style={{ fontFamily: 'var(--font-argus-serif)' }}><HardHat size={22} className="text-[#d9861c]" /> Obras</h1>
            <p className="text-[#9a958a] text-xs font-semibold mt-0.5">Cronograma, medições e contratados por obra</p>
          </div>
          <Link href="/argus/obras/nova" className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
            <Plus size={14} /> Nova Obra
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
            <p className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Total de Obras</p>
            <p className="text-2xl font-bold text-[#241c14]">{obras.length}</p>
          </div>
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
            <p className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Em Andamento</p>
            <p className="text-2xl font-bold text-[#d9861c]">{emAndamento}</p>
          </div>
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 col-span-2 md:col-span-1">
            <p className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Orçado Total</p>
            <p className="text-2xl font-bold text-[#1fa85a]">{fmtMoedaObra(orcadoTotal)}</p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div>
        ) : obras.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <HardHat size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm mb-4">Nenhuma obra cadastrada ainda.</p>
            <Link href="/argus/obras/nova" className="inline-flex items-center gap-2 bg-[#d9861c] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest">
              <Plus size={14} /> Cadastrar primeira obra
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {obras.map(obra => (
              <Link key={obra.id} href={`/argus/obras/${obra.id}`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/50 rounded-2xl p-5 transition-all flex flex-col gap-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-bold text-[#9a958a] uppercase tracking-wide">{formatObraId(obra.id)}</p>
                    <h2 className="text-sm font-bold text-[#241c14] leading-tight">{obra.nome}</h2>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full border whitespace-nowrap ${OBRA_STATUS_CORES[obra.status]}`}>
                    {OBRA_STATUS_LABELS[obra.status]}
                  </span>
                </div>
                {obra.endereco && (
                  <p className="text-[11px] text-[#6b6862] flex items-center gap-1.5"><MapPin size={12} className="flex-shrink-0" /> {obra.endereco}</p>
                )}
                <div className="flex items-center justify-between text-[10px] text-[#9a958a] font-bold uppercase mt-auto pt-2 border-t border-[#f0ede6]">
                  <span className="flex items-center gap-1.5"><Calendar size={12} /> {fmtDataObra(obra.data_inicio)}</span>
                  {obra.valor_orcado_total ? <span className="text-[#241c14]">{fmtMoedaObra(obra.valor_orcado_total)}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
