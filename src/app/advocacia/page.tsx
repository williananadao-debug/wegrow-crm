"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Sparkles, RefreshCw, Briefcase, DollarSign, Clock, AlertTriangle, Users, TrendingUp, Gavel, Scale } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import AdvocaciaTopNav from './AdvocaciaTopNav';
import { ADVOCACIA_STAGES, ADVOCACIA_STAGE_GANHO, ADVOCACIA_STAGE_PERDIDO, fmtMoeda, fmtMoedaCompacta, fmtPct, fmtData } from './shared';

type LeadResumo = { id: number; etapa: number; created_at: string; advocacia_area_juridica: string | null };
type ProcessoResumo = { id: number; status: string; area_juridica: string; data_inicio: string | null; data_encerramento: string | null };
type LancamentoResumo = { valor: number; status: 'pendente' | 'pago'; data_vencimento: string; data_pagamento: string | null };
type PrazoResumo = { id: number; titulo: string; data_prazo: string; advocacia_processos: { cliente_nome: string } | null };

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const STAGE_ORDEM = Object.keys(ADVOCACIA_STAGES).map(Number).filter(k => k !== ADVOCACIA_STAGE_PERDIDO);

export default function AdvocaciaPainelPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const nomeEmpresa = empresa?.nome;

  const [leads, setLeads] = useState<LeadResumo[]>([]);
  const [processos, setProcessos] = useState<ProcessoResumo[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoResumo[]>([]);
  const [prazos, setPrazos] = useState<PrazoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [narrativa, setNarrativa] = useState<string | null>(null);
  const [carregandoNarrativa, setCarregandoNarrativa] = useState(false);

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const em15Dias = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    const [{ data: leadsData }, { data: procData }, { data: lancData }, { data: prazosData }] = await Promise.all([
      supabase.from('leads').select('id, etapa, created_at, advocacia_area_juridica').eq('empresa_id', perfil.empresa_id),
      supabase.from('advocacia_processos').select('id, status, area_juridica, data_inicio, data_encerramento').eq('empresa_id', perfil.empresa_id),
      supabase.from('lancamentos').select('valor, status, data_vencimento, data_pagamento').eq('empresa_id', perfil.empresa_id).not('processo_id', 'is', null),
      supabase.from('advocacia_prazos').select('id, titulo, data_prazo, advocacia_processos(cliente_nome)')
        .eq('empresa_id', perfil.empresa_id).eq('concluido', false).lte('data_prazo', em15Dias).order('data_prazo', { ascending: true }),
    ]);
    setLeads((leadsData as LeadResumo[]) || []);
    setProcessos((procData as ProcessoResumo[]) || []);
    setLancamentos((lancData as LancamentoResumo[]) || []);
    setPrazos((prazosData as any) || []);
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const hoje = new Date();
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const mesRef = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const hojeStr = hoje.toISOString().slice(0, 10);

  const processosAtivos = processos.filter(p => p.status === 'ativo').length;
  const leadsNoMes = leads.filter(l => l.created_at >= inicioMes);
  const convertidosNoMes = leadsNoMes.filter(l => l.etapa === ADVOCACIA_STAGE_GANHO);
  const taxaConversao = leadsNoMes.length > 0 ? (convertidosNoMes.length / leadsNoMes.length) * 100 : 0;

  const faturamentoMes = lancamentos.filter(l => l.status === 'pago' && (l.data_pagamento || '').slice(0, 7) === mesRef).reduce((s, l) => s + Number(l.valor || 0), 0);
  const aReceber = lancamentos.filter(l => l.status === 'pendente').reduce((s, l) => s + Number(l.valor || 0), 0);
  const inadimplencia = lancamentos.filter(l => l.status === 'pendente' && l.data_vencimento < hojeStr).reduce((s, l) => s + Number(l.valor || 0), 0);

  const fluxo6meses = useMemo(() => {
    const meses: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const total = lancamentos.filter(l => l.status === 'pago' && (l.data_pagamento || '').slice(0, 7) === chave).reduce((s, l) => s + Number(l.valor || 0), 0);
      meses.push({ label: `${MESES_LABEL[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, total });
    }
    return meses;
  }, [lancamentos]);
  const maxFluxo = Math.max(1, ...fluxo6meses.map(m => m.total));

  const funil = useMemo(() => STAGE_ORDEM.map(stage => ({ stage, label: ADVOCACIA_STAGES[stage], total: leads.filter(l => l.etapa === stage).length })), [leads]);
  const maxFunil = Math.max(1, ...funil.map(f => f.total));

  // Taxa de êxito por área jurídica — só considera processos que já saíram de "ativo"
  // (concluído ou encerrado conta como êxito; arquivado conta como perda), senão a taxa
  // fica artificialmente baixa por causa dos processos ainda em andamento.
  const exitoPorArea = useMemo(() => {
    const mapa: Record<string, { ganhos: number; total: number }> = {};
    processos.filter(p => p.status !== 'ativo').forEach(p => {
      const area = p.area_juridica || 'Outro';
      if (!mapa[area]) mapa[area] = { ganhos: 0, total: 0 };
      mapa[area].total++;
      if (p.status === 'concluido' || p.status === 'encerrado') mapa[area].ganhos++;
    });
    return Object.entries(mapa)
      .map(([area, v]) => ({ area, pct: v.total > 0 ? (v.ganhos / v.total) * 100 : 0, total: v.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [processos]);

  // Tempo médio de processo (dias) — usa data_encerramento quando existe, senão hoje
  // (processo ainda ativo conta o tempo corrido até agora).
  const tempoMedioProcesso = useMemo(() => {
    const comInicio = processos.filter(p => p.data_inicio);
    if (comInicio.length === 0) return 0;
    const totalDias = comInicio.reduce((s, p) => {
      const inicio = new Date(p.data_inicio as string).getTime();
      const fim = p.data_encerramento ? new Date(p.data_encerramento).getTime() : Date.now();
      return s + Math.max(0, (fim - inicio) / 86400000);
    }, 0);
    return Math.round(totalDias / comInicio.length);
  }, [processos]);

  const buscarNarrativa = async () => {
    setCarregandoNarrativa(true);
    setNarrativa(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/advocacia/insights', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      setNarrativa(res.ok ? json.narrativa : (json.erro || 'Não consegui gerar os insights agora.'));
    } catch {
      setNarrativa('Não consegui gerar os insights agora.');
    } finally {
      setCarregandoNarrativa(false);
    }
  };

  return (
    <div>
      <AdvocaciaTopNav nomeEmpresa={nomeEmpresa} />
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-advocacia-serif)' }}>Painel geral</h1>
          <p className="text-[13px] text-[#6b6862] mt-1">Visão consolidada do escritório — CRM, financeiro e inteligência num só lugar.</p>
        </div>

        <div className="bg-[#241c14] rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-[#f0a94a] flex items-center gap-2"><Sparkles size={15} /> Resumo do mês, narrado</p>
            <button onClick={buscarNarrativa} disabled={carregandoNarrativa} className="text-[11px] font-semibold text-[#f0a94a] hover:underline flex items-center gap-1">
              {carregandoNarrativa ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {narrativa ? 'Atualizar' : 'Gerar'}
            </button>
          </div>
          <p className="text-[14px] text-white/90 leading-relaxed">
            {narrativa || 'Clique em "Gerar" pra pedir um resumo em português dos números deste mês.'}
          </p>
        </div>

        {!loading && prazos.length > 0 && (
          <div className="bg-[#fdf3e7] border border-[#d9861c]/30 rounded-2xl p-5 mb-6">
            <p className="flex items-center gap-2 text-[13px] font-bold text-[#a8630f] uppercase tracking-wide mb-3">
              <AlertTriangle size={15} /> {prazos.length} prazo(s) vencendo nos próximos 15 dias
            </p>
            <div className="space-y-1.5">
              {prazos.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2 text-[12.5px]">
                  <span className="font-semibold text-[#241c14]">{p.titulo}{p.advocacia_processos?.cliente_nome ? ` · ${p.advocacia_processos.cliente_nome}` : ''}</span>
                  <span className="text-[#8a7355]">{fmtData(p.data_prazo)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-[#d9861c]" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-[#9a958a] flex items-center gap-1"><Briefcase size={11} /> Processos ativos</p>
                <p className="text-[19px] font-bold text-[#241c14] mt-1 font-mono">{processosAtivos}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-[#9a958a] flex items-center gap-1"><DollarSign size={11} /> Faturamento do mês</p>
                <p className="text-[19px] font-bold text-[#241c14] mt-1 font-mono">{fmtMoedaCompacta(faturamentoMes)}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-[#9a958a] flex items-center gap-1"><Clock size={11} /> A receber</p>
                <p className="text-[19px] font-bold text-[#241c14] mt-1 font-mono">{fmtMoedaCompacta(aReceber)}</p>
              </div>
              <div className="bg-white border border-[#fce8e8] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-[#d63f3f] flex items-center gap-1"><AlertTriangle size={11} /> Inadimplência</p>
                <p className="text-[19px] font-bold text-[#d63f3f] mt-1 font-mono">{fmtMoedaCompacta(inadimplencia)}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-[#9a958a] flex items-center gap-1"><Users size={11} /> Novos leads/mês</p>
                <p className="text-[19px] font-bold text-[#241c14] mt-1 font-mono">{leadsNoMes.length}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-[#9a958a] flex items-center gap-1"><TrendingUp size={11} /> Conversão do mês</p>
                <p className="text-[19px] font-bold text-[#241c14] mt-1 font-mono">{fmtPct(taxaConversao)}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-[#9a958a] flex items-center gap-1"><Gavel size={11} /> Tempo médio de processo</p>
                <p className="text-[19px] font-bold text-[#241c14] mt-1 font-mono">{tempoMedioProcesso}d</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[13px] font-bold text-[#241c14] mb-4">Faturamento — últimos 6 meses</p>
                <div className="flex items-end gap-3 h-32">
                  {fluxo6meses.map(m => (
                    <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                      <span className="text-[10px] font-mono text-[#6b6862]">{fmtMoedaCompacta(m.total)}</span>
                      <div className="w-full bg-[#fdf0d4] rounded-t-md" style={{ height: `${Math.max(4, (m.total / maxFluxo) * 90)}px` }} />
                      <span className="text-[10px] text-[#9a958a]">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[13px] font-bold text-[#241c14] mb-4">Funil de processos</p>
                <div className="space-y-2.5">
                  {funil.map(f => (
                    <div key={f.stage} className="flex items-center gap-3">
                      <span className="text-[12px] text-[#6b6862] w-28 flex-shrink-0 truncate">{f.label}</span>
                      <div className="flex-1 h-2.5 bg-[#f0ede6] rounded-full overflow-hidden">
                        <div className="h-full bg-[#d9861c] rounded-full" style={{ width: `${(f.total / maxFunil) * 100}%` }} />
                      </div>
                      <span className="text-[12px] font-mono font-semibold text-[#241c14] w-6 text-right">{f.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {exitoPorArea.length > 0 && (
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mt-4">
                <p className="text-[13px] font-bold text-[#241c14] mb-1 flex items-center gap-2"><Scale size={14} /> Taxa de êxito por área jurídica</p>
                <p className="text-[11px] text-[#9a958a] mb-4">Só processos já concluídos, encerrados ou arquivados — os ainda ativos não contam.</p>
                <div className="space-y-2.5">
                  {exitoPorArea.map(a => (
                    <div key={a.area} className="flex items-center gap-3">
                      <span className="text-[12px] text-[#6b6862] w-40 flex-shrink-0 truncate">{a.area}</span>
                      <div className="flex-1 h-2.5 bg-[#f0ede6] rounded-full overflow-hidden">
                        <div className="h-full bg-[#1fa85a] rounded-full" style={{ width: `${a.pct}%` }} />
                      </div>
                      <span className="text-[12px] font-mono font-semibold text-[#241c14] w-16 text-right">{fmtPct(a.pct)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
