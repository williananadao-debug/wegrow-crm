"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Sparkles, TrendingUp, Flame, ShieldAlert, Target, Users, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import AdvocaciaTopNav from '../AdvocaciaTopNav';
import { fmtMoeda, fmtPct, fmtData, diasDesde, DIAS_LEAD_ESFRIANDO, ADVOCACIA_STAGE_GANHO, ADVOCACIA_STAGE_PERDIDO } from '../shared';

type LeadInt = { id: number; empresa: string; etapa: number; status: string; origem: string | null; followup_em: string | null; created_at: string; advocacia_advogado_id: string | null };
type Processo = { id: number; cliente_nome: string; advogado_responsavel_id: string | null; status: string };
type Lancamento = { id: number; valor: number; status: 'pendente' | 'pago'; data_vencimento: string; data_pagamento: string | null; processo_id: number | null };
type CanalCusto = { canal: string; valor_investido: number };
type PerfilOpcao = { id: string; nome: string };

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function AdvocaciaInteligenciaPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const nomeEmpresa = empresa?.nome;
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const [leads, setLeads] = useState<LeadInt[]>([]);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [advogados, setAdvogados] = useState<PerfilOpcao[]>([]);
  const [canaisCusto, setCanaisCusto] = useState<CanalCusto[]>([]);
  const [loading, setLoading] = useState(true);
  const [narrativa, setNarrativa] = useState<string | null>(null);
  const [carregandoNarrativa, setCarregandoNarrativa] = useState(false);

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: leadsData }, { data: procData }, { data: lancData }, { data: perfisData }, { data: canaisData }] = await Promise.all([
      supabase.from('leads').select('id, empresa, etapa, status, origem, followup_em, created_at, advocacia_advogado_id').eq('empresa_id', perfil.empresa_id),
      supabase.from('advocacia_processos').select('id, cliente_nome, advogado_responsavel_id, status').eq('empresa_id', perfil.empresa_id),
      supabase.from('lancamentos').select('id, valor, status, data_vencimento, data_pagamento, processo_id').eq('empresa_id', perfil.empresa_id).not('processo_id', 'is', null),
      supabase.from('profiles').select('id, nome').eq('empresa_id', perfil.empresa_id),
      supabase.from('advocacia_canais_custo').select('canal, valor_investido').eq('empresa_id', perfil.empresa_id).eq('ano', anoAtual).eq('mes', mesAtual),
    ]);
    setLeads((leadsData as LeadInt[]) || []);
    setProcessos((procData as Processo[]) || []);
    setLancamentos((lancData as Lancamento[]) || []);
    setAdvogados((perfisData as PerfilOpcao[]) || []);
    setCanaisCusto((canaisData as CanalCusto[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id, anoAtual, mesAtual]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeAdvogado = (id?: string | null) => advogados.find(a => a.id === id)?.nome || 'Sem responsável';

  // --- Produtividade por advogado ---
  const produtividade = useMemo(() => {
    const mapa = new Map<string, { ativos: number; concluidos: number }>();
    processos.forEach(p => {
      const chave = nomeAdvogado(p.advogado_responsavel_id);
      const atual = mapa.get(chave) || { ativos: 0, concluidos: 0 };
      if (p.status === 'ativo') atual.ativos++;
      if (p.status === 'concluido') atual.concluidos++;
      mapa.set(chave, atual);
    });
    return [...mapa.entries()].sort((a, b) => (b[1].ativos + b[1].concluidos) - (a[1].ativos + a[1].concluidos));
  }, [processos, advogados]);

  // --- Canais: leads recebidos, convertidos, taxa de conversão ---
  const canais = useMemo(() => {
    const mapa = new Map<string, { total: number; convertidos: number }>();
    leads.forEach(l => {
      const canal = (l.origem || 'Não informado').trim() || 'Não informado';
      const atual = mapa.get(canal) || { total: 0, convertidos: 0 };
      atual.total++;
      if (l.etapa === ADVOCACIA_STAGE_GANHO) atual.convertidos++;
      mapa.set(canal, atual);
    });
    return [...mapa.entries()].map(([canal, d]) => ({ canal, ...d, taxa: d.total > 0 ? (d.convertidos / d.total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  }, [leads]);

  // --- CAC por canal (custo do mês / conversões do mês) ---
  const cacPorCanal = useMemo(() => {
    return canais.map(c => {
      const custo = canaisCusto.find(cc => cc.canal === c.canal)?.valor_investido || 0;
      const convertidosMes = leads.filter(l => (l.origem || 'Não informado').trim() === c.canal && l.etapa === ADVOCACIA_STAGE_GANHO && l.created_at.slice(0, 7) === `${anoAtual}-${String(mesAtual).padStart(2, '0')}`).length;
      const cac = convertidosMes > 0 ? custo / convertidosMes : null;
      return { ...c, custo, convertidosMes, cac };
    });
  }, [canais, canaisCusto, leads, anoAtual, mesAtual]);

  const salvarCusto = async (canal: string, valor: string) => {
    if (!perfil?.empresa_id) return;
    await supabase.from('advocacia_canais_custo').upsert(
      { empresa_id: perfil.empresa_id, canal, ano: anoAtual, mes: mesAtual, valor_investido: Number(valor) || 0 },
      { onConflict: 'empresa_id,canal,ano,mes' }
    );
    carregar();
  };

  // --- Ticket médio (leads ganhos) ---
  const leadsGanhos = leads.filter(l => l.etapa === ADVOCACIA_STAGE_GANHO);
  const ticketMedio = useMemo(() => {
    const recebidos = lancamentos.filter(l => l.status === 'pago');
    if (recebidos.length === 0) return 0;
    return recebidos.reduce((s, l) => s + Number(l.valor || 0), 0) / recebidos.length;
  }, [lancamentos]);

  // --- Leads esfriando ---
  const leadsEsfriando = useMemo(() => leads.filter(l => {
    if (l.etapa === ADVOCACIA_STAGE_GANHO || l.etapa === ADVOCACIA_STAGE_PERDIDO) return false;
    const dias = diasDesde(l.followup_em);
    return dias !== null && dias >= DIAS_LEAD_ESFRIANDO;
  }).sort((a, b) => (diasDesde(b.followup_em) || 0) - (diasDesde(a.followup_em) || 0)), [leads]);

  // --- Risco de inadimplência (heurística simples e explícita, não é ML) ---
  const riscoInadimplencia = useMemo(() => {
    const hojeStr = hoje.toISOString().slice(0, 10);
    const porProcesso = new Map<number, Lancamento[]>();
    lancamentos.forEach(l => {
      if (!l.processo_id) return;
      const lista = porProcesso.get(l.processo_id) || [];
      lista.push(l);
      porProcesso.set(l.processo_id, lista);
    });
    const linhas: { cliente: string; score: number; vencidos: number; total: number }[] = [];
    porProcesso.forEach((lancs, processoId) => {
      const proc = processos.find(p => p.id === processoId);
      if (!proc) return;
      const jaVenceram = lancs.filter(l => l.data_vencimento < hojeStr);
      if (jaVenceram.length === 0) return;
      const problemas = jaVenceram.filter(l => l.status === 'pendente' || (l.data_pagamento && l.data_pagamento > l.data_vencimento));
      const score = (problemas.length / jaVenceram.length) * 100;
      if (score > 0) linhas.push({ cliente: proc.cliente_nome, score, vencidos: problemas.length, total: jaVenceram.length });
    });
    return linhas.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [lancamentos, processos]);

  // --- Previsão de faturamento (extrapolação simples de tendência, não é ML) ---
  const previsao = useMemo(() => {
    const meses: number[] = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(anoAtual, hoje.getMonth() - i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.push(lancamentos.filter(l => l.status === 'pago' && (l.data_pagamento || '').slice(0, 7) === chave).reduce((s, l) => s + Number(l.valor || 0), 0));
    }
    const mesesComReceita = meses.filter(v => v > 0);
    if (mesesComReceita.length < 2) return null;
    const variacoes: number[] = [];
    for (let i = 1; i < meses.length; i++) {
      if (meses[i - 1] > 0) variacoes.push((meses[i] - meses[i - 1]) / meses[i - 1]);
    }
    const crescimentoMedio = variacoes.length > 0 ? variacoes.reduce((s, v) => s + v, 0) / variacoes.length : 0;
    const ultimoMes = meses[meses.length - 1];
    return { proximoMes: ultimoMes * (1 + crescimentoMedio), crescimentoMedio, ultimoMes };
  }, [lancamentos, anoAtual, hoje]);

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-advocacia-serif)' }}>Inteligência</h1>
            <p className="text-[13px] text-[#6b6862] mt-1">Produtividade, canais, CAC, risco e previsão — tudo calculado sobre os dados reais do escritório.</p>
          </div>
        </div>

        <div className="bg-[#241c14] rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-[#f0a94a] flex items-center gap-2"><Sparkles size={15} /> Resumo do mês, narrado</p>
            <button onClick={buscarNarrativa} disabled={carregandoNarrativa} className="text-[11px] font-semibold text-[#f0a94a] hover:underline flex items-center gap-1">
              {carregandoNarrativa ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {narrativa ? 'Atualizar' : 'Gerar'}
            </button>
          </div>
          <p className="text-[14px] text-white/90 leading-relaxed">
            {narrativa || 'Clique em "Gerar" pra pedir um resumo em português dos números deste mês — leads, conversão por canal, follow-ups atrasados.'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-[#d9861c]" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase text-[#9a958a]">Ticket médio (honorário pago)</p>
                <p className="text-[22px] font-bold text-[#241c14] mt-1 font-mono">{fmtMoeda(ticketMedio)}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase text-[#9a958a] flex items-center gap-1.5"><TrendingUp size={12} /> Previsão próximo mês</p>
                <p className="text-[22px] font-bold text-[#241c14] mt-1 font-mono">{previsao ? fmtMoeda(previsao.proximoMes) : '—'}</p>
                <p className="text-[11px] text-[#9a958a] mt-0.5">{previsao ? `tendência: ${previsao.crescimentoMedio >= 0 ? '+' : ''}${fmtPct(previsao.crescimentoMedio * 100)}/mês` : 'dados insuficientes (mín. 2 meses com receita)'}</p>
              </div>
              <div className="bg-white border border-[#fce8e8] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase text-[#d63f3f] flex items-center gap-1.5"><Flame size={12} /> Leads esfriando</p>
                <p className="text-[22px] font-bold text-[#d63f3f] mt-1 font-mono">{leadsEsfriando.length}</p>
                <p className="text-[11px] text-[#9a958a] mt-0.5">follow-up vencido há {DIAS_LEAD_ESFRIANDO}+ dias</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold uppercase text-[#9a958a] mb-3 flex items-center gap-1.5"><Target size={12} /> Canais — leads, conversão e CAC</p>
                <div className="space-y-3">
                  {cacPorCanal.map(c => (
                    <div key={c.canal} className="border-b border-[#f0ede6] pb-2.5 last:border-0">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-semibold text-[#241c14]">{c.canal}</span>
                        <span className="text-[#9a958a]">{c.total} lead(s) · {fmtPct(c.taxa)} conversão</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-[#9a958a]">Investido/mês:</span>
                        <input type="number" defaultValue={c.custo || ''} onBlur={e => salvarCusto(c.canal, e.target.value)}
                          className="w-24 border border-[#e5e0d5] rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#d9861c]" placeholder="0,00" />
                        <span className="text-[11px] text-[#6b6862] ml-auto">CAC: {c.cac !== null ? fmtMoeda(c.cac) : '—'}</span>
                      </div>
                    </div>
                  ))}
                  {cacPorCanal.length === 0 && <p className="text-[12px] text-[#9a958a]">Sem leads com canal registrado ainda.</p>}
                </div>
              </div>

              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold uppercase text-[#9a958a] mb-3 flex items-center gap-1.5"><Users size={12} /> Produtividade por advogado</p>
                <div className="space-y-2">
                  {produtividade.map(([nome, d]) => (
                    <div key={nome} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#241c14]">{nome}</span>
                      <span className="text-[#6b6862] font-mono">{d.ativos} ativo(s) · {d.concluidos} concluído(s)</span>
                    </div>
                  ))}
                  {produtividade.length === 0 && <p className="text-[12px] text-[#9a958a]">Sem processos ainda.</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold uppercase text-[#9a958a] mb-3 flex items-center gap-1.5"><Flame size={12} /> Leads esfriando</p>
                <div className="space-y-2">
                  {leadsEsfriando.map(l => (
                    <div key={l.id} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#241c14]">{l.empresa}</span>
                      <span className="text-[#d63f3f] font-mono">{diasDesde(l.followup_em)}d sem follow-up</span>
                    </div>
                  ))}
                  {leadsEsfriando.length === 0 && <p className="text-[12px] text-[#9a958a]">Nenhum lead esfriando agora.</p>}
                </div>
              </div>

              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold uppercase text-[#9a958a] mb-3 flex items-center gap-1.5"><ShieldAlert size={12} /> Risco de inadimplência</p>
                <p className="text-[11px] text-[#9a958a] mb-3">Heurística: % de lançamentos vencidos que ficaram pendentes ou foram pagos com atraso — não é modelo preditivo.</p>
                <div className="space-y-2">
                  {riscoInadimplencia.map(r => (
                    <div key={r.cliente} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#241c14]">{r.cliente}</span>
                      <span className={`font-mono font-semibold ${r.score >= 50 ? 'text-[#d63f3f]' : r.score >= 20 ? 'text-[#d9861c]' : 'text-[#6b6862]'}`}>{fmtPct(r.score)} ({r.vencidos}/{r.total})</span>
                    </div>
                  ))}
                  {riscoInadimplencia.length === 0 && <p className="text-[12px] text-[#9a958a]">Sem histórico de vencimento ainda.</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
