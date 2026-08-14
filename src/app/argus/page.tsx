"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ChevronRight, HardHat, Receipt } from 'lucide-react';
import ArgusTopNav from './ArgusTopNav';
import { ArgusEdital, STATUS_INTERESSE_CORES, STATUS_INTERESSE_LABELS, fmtMoeda, fmtMoedaCompacta, fmtData } from './shared';
import { OBRA_STATUS_LABELS, OBRA_STATUS_CORES } from '@/app/obras/shared';
import ArgusPainelVeiculos from './PainelVeiculos';

type ObraResumo = { id: number; nome: string; status: string };

// Componente-porta sem hooks próprios — decide a vertical e delega. Não dá pra fazer
// esse "if" dentro do componente de licitação (que já usa vários hooks abaixo), porque
// React exige a mesma sequência de hooks em toda renderização.
export default function ArgusPainelPage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  if ((empresa?.modulos?.argus_vertical || 'licitacao') === 'veiculos') {
    return <ArgusPainelVeiculos />;
  }
  return <ArgusPainelLicitacao />;
}

function ArgusPainelLicitacao() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temObras = Boolean(empresa?.modulos?.obras);

  const [editais, setEditais] = useState<ArgusEdital[]>([]);
  const [loading, setLoading] = useState(true);

  const [obras, setObras] = useState<ObraResumo[]>([]);
  const [medicoesPendentes, setMedicoesPendentes] = useState(0);
  const [orcadoObras, setOrcadoObras] = useState(0);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('argus_editais').select('*').eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setEditais((data as ArgusEdital[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  // Painel Geral do Argus também resume Obras quando a empresa tem os dois
  // módulos ativos — pedido explícito: ver os módulos consolidados aqui, não
  // só licitação isolada.
  useEffect(() => {
    if (!perfil?.empresa_id || !temObras) return;
    Promise.all([
      supabase.from('obras').select('id, nome, status, valor_orcado_total').eq('empresa_id', perfil.empresa_id),
      supabase.from('medicoes').select('id', { count: 'exact', head: true }).eq('empresa_id', perfil.empresa_id).eq('status', 'em_aprovacao'),
    ]).then(([obrasRes, medicoesRes]) => {
      const lista = (obrasRes.data as any[]) || [];
      setObras(lista);
      setOrcadoObras(lista.reduce((acc, o) => acc + Number(o.valor_orcado_total || 0), 0));
      setMedicoesPendentes(medicoesRes.count || 0);
    });
  }, [perfil?.empresa_id, temObras]);

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
            <span className="text-[12px] font-bold uppercase tracking-widest text-white/70">Inteligência em Licitações</span>
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] mb-4" style={{ fontFamily: 'var(--font-argus-serif)' }}>
            Controle total<br />das <em className="text-[#f0a94a]">Licitações</em>
          </h1>
          <p className="text-white/60 text-sm max-w-md mb-8">
            Monitoramento de editais via PNCP + agente de IA que analisa, alerta e recomenda ações pra propostas, contratos e prazos.
          </p>
          <div className="flex flex-wrap gap-10">
            <div><p className="text-3xl font-bold">{emAcompanhamento.length}</p><p className="text-[12px] text-white/50 font-bold uppercase tracking-wide mt-1">Em acompanhamento</p></div>
            <div><p className="text-3xl font-bold">{fmtMoedaCompacta(valorTotalDisputa)}</p><p className="text-[12px] text-white/50 font-bold uppercase tracking-wide mt-1">Valor total em disputa</p></div>
            <div><p className="text-3xl font-bold">{taxaExito}%</p><p className="text-[12px] text-white/50 font-bold uppercase tracking-wide mt-1">Taxa de êxito</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-bold text-[#9a958a] uppercase tracking-widest">Editais em destaque</p>
          <Link href="/argus/licitacoes" className="text-[13px] font-bold text-[#d9861c] flex items-center gap-1">Ver todos <ChevronRight size={12} /></Link>
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
                  <p className="text-[12px] font-bold text-[#9a958a] uppercase">{edital.modalidade || 'Edital'}</p>
                  <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_INTERESSE_CORES[edital.status_interesse]}`}>
                    {STATUS_INTERESSE_LABELS[edital.status_interesse]}
                  </span>
                </div>
                <p className="text-sm font-bold text-[#241c14] leading-snug line-clamp-2">{edital.orgao || edital.objeto || 'Sem órgão'}</p>
                <p className="text-[13px] text-[#6b6862] line-clamp-2">{edital.objeto}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#f0ede6]">
                  <span className="text-[12px] text-[#9a958a] font-semibold">{edital.municipio}{edital.uf ? `, ${edital.uf}` : ''}</span>
                  <span className="text-xs font-bold text-[#241c14]">{fmtMoeda(edital.valor_estimado)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {temObras && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[13px] font-bold text-[#9a958a] uppercase tracking-widest flex items-center gap-2"><HardHat size={14} /> Obras</p>
              <Link href="/argus/obras" className="text-[13px] font-bold text-[#d9861c] flex items-center gap-1">Ver todas <ChevronRight size={12} /></Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Total de obras</p>
                <p className="text-xl font-bold text-[#241c14]">{obras.length}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Em andamento</p>
                <p className="text-xl font-bold text-[#241c14]">{obras.filter(o => o.status === 'em_andamento').length}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Orçado total</p>
                <p className="text-xl font-bold text-[#241c14]">{fmtMoedaCompacta(orcadoObras)}</p>
              </div>
              <div className={`bg-white border rounded-2xl p-4 ${medicoesPendentes > 0 ? 'border-[#d9861c]/40' : 'border-[#e5e0d5]'}`}>
                <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 flex items-center gap-1"><Receipt size={11} /> Medições pendentes</p>
                <p className={`text-xl font-bold ${medicoesPendentes > 0 ? 'text-[#d9861c]' : 'text-[#241c14]'}`}>{medicoesPendentes}</p>
              </div>
            </div>

            {obras.length > 0 && (
              <div className="space-y-2">
                {obras.slice(0, 5).map(o => (
                  <Link key={o.id} href={`/argus/obras/${o.id}`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/40 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-all">
                    <p className="text-xs font-bold text-[#241c14] truncate">{o.nome}</p>
                    <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${OBRA_STATUS_CORES[o.status as keyof typeof OBRA_STATUS_CORES] || 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]'}`}>
                      {OBRA_STATUS_LABELS[o.status as keyof typeof OBRA_STATUS_LABELS] || o.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
