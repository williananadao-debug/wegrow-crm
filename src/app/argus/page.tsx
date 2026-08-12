"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ChevronRight } from 'lucide-react';
import ArgusTopNav from './ArgusTopNav';
import { ArgusEdital, STATUS_INTERESSE_CORES, STATUS_INTERESSE_LABELS, fmtMoeda, fmtMoedaCompacta, fmtData } from './shared';

export default function ArgusPainelPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [editais, setEditais] = useState<ArgusEdital[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('argus_editais').select('*').eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setEditais((data as ArgusEdital[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  const emAcompanhamento = editais.filter(e => !['perdido', 'arquivado'].includes(e.status_interesse));
  const valorTotalDisputa = emAcompanhamento.reduce((acc, e) => acc + Number(e.valor_estimado || 0), 0);
  const ganhos = editais.filter(e => e.status_interesse === 'ganho').length;
  const finalizados = editais.filter(e => ['ganho', 'perdido'].includes(e.status_interesse)).length;
  const taxaExito = finalizados > 0 ? Math.round((ganhos / finalizados) * 100) : 0;
  const destaques = [...emAcompanhamento].sort((a, b) => Number(b.valor_estimado || 0) - Number(a.valor_estimado || 0)).slice(0, 5);

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />

      <header className="bg-[#241c14] text-white">
        <div className="max-w-[1400px] mx-auto px-6 py-14">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d9861c]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Inteligência em Licitações</span>
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] mb-4" style={{ fontFamily: 'var(--font-argus-serif)' }}>
            Controle total<br />das <em className="text-[#f0a94a]">Licitações</em>
          </h1>
          <p className="text-white/60 text-sm max-w-md mb-8">
            Monitoramento de editais via PNCP + agente de IA que analisa, alerta e recomenda ações pra propostas, contratos e prazos.
          </p>
          <div className="flex flex-wrap gap-10">
            <div><p className="text-3xl font-bold">{emAcompanhamento.length}</p><p className="text-[10px] text-white/50 font-bold uppercase tracking-wide mt-1">Em acompanhamento</p></div>
            <div><p className="text-3xl font-bold">{fmtMoedaCompacta(valorTotalDisputa)}</p><p className="text-[10px] text-white/50 font-bold uppercase tracking-wide mt-1">Valor total em disputa</p></div>
            <div><p className="text-3xl font-bold">{taxaExito}%</p><p className="text-[10px] text-white/50 font-bold uppercase tracking-wide mt-1">Taxa de êxito</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-widest">Editais em destaque</p>
          <Link href="/argus/licitacoes" className="text-[11px] font-bold text-[#d9861c] flex items-center gap-1">Ver todos <ChevronRight size={12} /></Link>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div>
        ) : destaques.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <p className="text-[#6b6862] font-semibold text-sm mb-4">Nenhum edital acompanhado ainda.</p>
            <Link href="/argus/licitacoes" className="inline-flex items-center gap-2 bg-[#d9861c] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest">
              Buscar no PNCP
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {destaques.map(edital => (
              <Link key={edital.id} href={`/argus/licitacoes/${edital.id}`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/50 rounded-2xl p-5 transition-all flex flex-col gap-2 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-bold text-[#9a958a] uppercase">{edital.modalidade || 'Edital'}</p>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_INTERESSE_CORES[edital.status_interesse]}`}>
                    {STATUS_INTERESSE_LABELS[edital.status_interesse]}
                  </span>
                </div>
                <p className="text-sm font-bold text-[#241c14] leading-snug line-clamp-2">{edital.orgao || edital.objeto || 'Sem órgão'}</p>
                <p className="text-[11px] text-[#6b6862] line-clamp-2">{edital.objeto}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#f0ede6]">
                  <span className="text-[10px] text-[#9a958a] font-semibold">{edital.municipio}{edital.uf ? `, ${edital.uf}` : ''}</span>
                  <span className="text-xs font-bold text-[#241c14]">{fmtMoeda(edital.valor_estimado)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
