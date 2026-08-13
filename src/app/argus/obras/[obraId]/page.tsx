"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, HardHat, ArrowLeft, MapPin, Calendar, ListChecks, Users, Receipt, ChevronRight, FileSearch, Boxes } from 'lucide-react';
import ArgusTopNav from '../../ArgusTopNav';
import { Obra, ObraEtapa, Medicao, OBRA_STATUS_LABELS, OBRA_STATUS_CORES, fmtMoeda, fmtData, formatObraId } from '@/app/obras/shared';

export default function ArgusObraDetalhePage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

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

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  if (!obra) {
    return (
      <div>
        <ArgusTopNav nomeEmpresa={empresa?.nome} />
        <div className="max-w-[1400px] mx-auto px-6 py-10 text-center text-[#6b6862] font-semibold">Obra não encontrada.</div>
      </div>
    );
  }

  const percentualMedio = etapas.length > 0
    ? etapas.reduce((acc, e) => acc + Number(e.percentual_executado || 0), 0) / etapas.length
    : 0;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Link href="/argus/obras" className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar
        </Link>

        <header className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide">{formatObraId(obra.id)}</p>
            <h1 className="text-2xl font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-argus-serif)' }}>{obra.nome}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className={`text-[12px] font-bold uppercase px-2.5 py-1 rounded-full border ${OBRA_STATUS_CORES[obra.status]}`}>
                {OBRA_STATUS_LABELS[obra.status]}
              </span>
              {obra.endereco && <span className="text-xs text-[#6b6862] flex items-center gap-1.5"><MapPin size={12} /> {obra.endereco}</span>}
              <span className="text-xs text-[#6b6862] flex items-center gap-1.5"><Calendar size={12} /> {fmtData(obra.data_inicio)} — {fmtData(obra.data_prevista_fim)}</span>
            </div>
          </div>
          {obra.valor_orcado_total ? (
            <div className="text-right">
              <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide">Orçamento Total</p>
              <p className="text-2xl font-bold text-[#1fa85a]">{fmtMoeda(obra.valor_orcado_total)}</p>
            </div>
          ) : null}
        </header>

        {obra.edital_id && (
          <Link href={`/argus/licitacoes/${obra.edital_id}`} className="mb-6 flex items-center gap-2 text-[#d9861c] text-xs font-bold uppercase tracking-widest hover:underline w-fit">
            <FileSearch size={14} /> Ver edital de origem desta obra
          </Link>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href={`/argus/obras/${obra.id}/cronograma`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/50 rounded-2xl p-6 transition-all flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-[#fdf0d4] rounded-xl flex items-center justify-center"><ListChecks size={18} className="text-[#d9861c]" /></div>
              <ChevronRight size={16} className="text-[#c9c3b5]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241c14] uppercase">Cronograma</p>
              <p className="text-[12px] text-[#9a958a] font-bold uppercase mt-0.5">{etapas.length} etapa(s)</p>
            </div>
            <div className="w-full h-1.5 bg-[#f0ede6] rounded-full overflow-hidden">
              <div className="h-full bg-[#d9861c] rounded-full transition-all" style={{ width: `${Math.min(percentualMedio, 100)}%` }} />
            </div>
            <p className="text-[12px] text-[#9a958a] font-bold">{Math.round(percentualMedio)}% executado (média das etapas)</p>
          </Link>

          <Link href={`/argus/obras/${obra.id}/medicoes`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/50 rounded-2xl p-6 transition-all flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-[#e8f0fd] rounded-xl flex items-center justify-center"><Receipt size={18} className="text-[#1d6fd9]" /></div>
              <ChevronRight size={16} className="text-[#c9c3b5]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241c14] uppercase">Medições</p>
              <p className="text-[12px] text-[#9a958a] font-bold uppercase mt-0.5">{medicoes.length} recente(s)</p>
            </div>
            <p className="text-[12px] text-[#9a958a] font-bold">
              {medicoes.filter(m => m.status === 'em_aprovacao').length} aguardando aprovação
            </p>
          </Link>

          <Link href={`/argus/obras/${obra.id}/contratados`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/50 rounded-2xl p-6 transition-all flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-[#d9f2e3] rounded-xl flex items-center justify-center"><Users size={18} className="text-[#1fa85a]" /></div>
              <ChevronRight size={16} className="text-[#c9c3b5]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241c14] uppercase">Contratados</p>
              <p className="text-[12px] text-[#9a958a] font-bold uppercase mt-0.5">Fornecedores e subempreiteiros</p>
            </div>
          </Link>

          <Link href={`/argus/obras/${obra.id}/suprimentos`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/50 rounded-2xl p-6 transition-all flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-[#f3e8fd] rounded-xl flex items-center justify-center"><Boxes size={18} className="text-[#8b5cf6]" /></div>
              <ChevronRight size={16} className="text-[#c9c3b5]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241c14] uppercase">Suprimentos</p>
              <p className="text-[12px] text-[#9a958a] font-bold uppercase mt-0.5">Requisição de material</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
