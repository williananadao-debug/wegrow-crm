"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Factory, Hammer, CheckCircle2, PackageCheck, AlertTriangle, Maximize2, ListChecks, Clock, Activity, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';
import { etapasFabricacaoDe, prazosEtapasFabricacaoDe, checklistsEtapasFabricacaoDe, type ChecklistFeito } from '../../shared';

type StatusProducao = 'em_producao' | 'concluida' | 'entregue';
type Producao = {
  id: number; lead_id?: number | null; produto_final_nome: string; quantidade_produzida: number; status: StatusProducao;
  previsao_entrega: string | null; etapa_fabricacao_idx: number; created_at: string;
  checklist_feito?: ChecklistFeito | null; etapa_iniciada_em?: string | null;
};
type Evento = { id: number; producao_id: number; tipo: string; texto: string | null; foto_url: string | null; user_id: string | null; created_at: string };

const REFRESH_MS = 45000;
const PAGINA_MS = 12000; // troca de página das listas longas (TV não rola)
const POR_PAGINA = 7;

// Wallboard de TV pro chão de fábrica — sem sidebar/topbar (ver hasCustomShell em
// publicPages.ts), sem valor monetário nem nome de cliente (só número do pedido), fonte grande
// pra ler de longe, atualiza sozinho. Mostra: totais, gargalo por etapa, a linha de produção
// trailer a trailer (etapa, checklist, dias na etapa x prazo), etapas paradas aguardando
// início, últimas atividades e fotos recentes.
export default function PainelProducaoPage() {
  const { authLoading, temPulse, perfil, empresa } = usePulseAccess();
  const ETAPAS = useMemo(() => etapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);
  const PRAZOS = useMemo(() => prazosEtapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);
  const CHECKLISTS = useMemo(() => checklistsEtapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);

  const [producoes, setProducoes] = useState<Producao[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [pagina, setPagina] = useState(0);

  const empresaId = perfil?.empresa_id as string | undefined;
  const carregar = useCallback(async () => {
    if (!empresaId) return;
    const desde30d = new Date(); desde30d.setDate(desde30d.getDate() - 30);
    // '*' traz checklist/início de etapa sem quebrar antes das migrations.
    const { data: producoesData } = await supabase.from('pulse_producoes')
      .select('*').neq('status', 'entregue').order('created_at', { ascending: true }).limit(200);
    const ids = (producoesData || []).map(p => p.id);
    const [{ data: eventosData }, { data: entregasData }, { data: perfis }] = await Promise.all([
      ids.length
        ? supabase.from('pulse_producao_eventos').select('id, producao_id, tipo, texto, foto_url, user_id, created_at')
            .in('producao_id', ids).gte('created_at', desde30d.toISOString()).order('created_at', { ascending: false }).limit(400)
        : Promise.resolve({ data: [] as Evento[] }),
      supabase.from('pulse_producao_eventos').select('id, producao_id, tipo, texto, foto_url, user_id, created_at')
        .eq('tipo', 'status').ilike('texto', '%Entregue%').gte('created_at', desde30d.toISOString()),
      supabase.from('profiles').select('id, nome').eq('empresa_id', empresaId),
    ]);
    if (producoesData) setProducoes(producoesData as Producao[]);
    setEventos([...(eventosData || []), ...(entregasData || [])] as Evento[]);
    setNomes(Object.fromEntries((perfis || []).map(p => [p.id, (p.nome || '').split(' ')[0]])));
    setAtualizadoEm(new Date());
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { const id = setInterval(carregar, REFRESH_MS); return () => clearInterval(id); }, [carregar]);
  useEffect(() => { const id = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { const id = setInterval(() => setPagina(p => p + 1), PAGINA_MS); return () => clearInterval(id); }, []);

  const pedido = (p: Producao) => (p.lead_id ? `LD-${String(p.lead_id).padStart(4, '0')}` : `#${p.id}`);
  const ultimaConclusao = useMemo(() => {
    const m: Record<number, string> = {};
    eventos.filter(e => e.tipo === 'etapa').forEach(e => { if (!m[e.producao_id] || e.created_at > m[e.producao_id]) m[e.producao_id] = e.created_at; });
    return m;
  }, [eventos]);
  const dias = (desde: string) => Math.max(0, Math.floor((agora.getTime() - new Date(desde).getTime()) / 86400000));

  const emProducao = producoes.filter(p => p.status === 'em_producao');
  const aguardandoEntrega = producoes.filter(p => p.status === 'concluida');
  const atrasadas = producoes.filter(p => p.previsao_entrega && new Date(p.previsao_entrega) < agora);
  const aguardandoInicio = (p: Producao) => p.status === 'em_producao' && p.etapa_iniciada_em === null;
  const paradas = emProducao.filter(aguardandoInicio)
    .map(p => ({ p, d: dias(ultimaConclusao[p.id] || p.created_at) }))
    .sort((a, b) => b.d - a.d);

  const entregas = eventos.filter(e => e.tipo === 'status' && /entregue/i.test(e.texto || ''));
  const inicioHoje = new Date(agora); inicioHoje.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(agora); inicioSemana.setDate(inicioSemana.getDate() - 7);
  const entreguesHoje = entregas.filter(e => new Date(e.created_at) >= inicioHoje).length;
  const entreguesSemana = entregas.filter(e => new Date(e.created_at) >= inicioSemana).length;
  const etapasHoje = eventos.filter(e => e.tipo === 'etapa' && new Date(e.created_at) >= inicioHoje).length;

  const porEtapa = ETAPAS.map((nome, idx) => ({ nome, quantidade: emProducao.filter(p => p.etapa_fabricacao_idx === idx).length }));
  const maxEtapa = Math.max(1, ...porEtapa.map(e => e.quantidade));

  // Linha de produção: parados primeiro, depois quem está há mais tempo na etapa.
  const linha = emProducao
    .map(p => {
      const etapa = ETAPAS[p.etapa_fabricacao_idx];
      const itens = CHECKLISTS[etapa] || [];
      const feitos = itens.filter(i => p.checklist_feito?.[etapa]?.[i]).length;
      const inicio = p.etapa_iniciada_em || ultimaConclusao[p.id] || p.created_at;
      return { p, etapa, itens: itens.length, feitos, diasEtapa: dias(inicio), prazo: PRAZOS[etapa], parado: aguardandoInicio(p) };
    })
    .sort((a, b) => Number(b.parado) - Number(a.parado) || b.diasEtapa - a.diasEtapa);
  const totalPaginas = Math.max(1, Math.ceil(linha.length / POR_PAGINA));
  const paginaAtual = pagina % totalPaginas;
  const linhaVisivel = linha.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA);

  const atividades = eventos
    .filter(e => e.tipo === 'etapa' || (e.tipo === 'status' && e.texto))
    .slice(0, 8);
  const fotos = eventos.filter(e => e.foto_url).slice(0, 6);
  const prodPorId = useMemo(() => new Map(producoes.map(p => [p.id, p])), [producoes]);

  const telaCheia = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-[#0B1120] flex items-center justify-center"><Loader2 size={40} className="animate-spin text-slate-600" /></div>;
  }
  if (!temPulse) {
    return <div className="min-h-screen bg-[#0B1120] flex items-center justify-center text-center p-8"><p className="text-slate-500 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p></div>;
  }

  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div className="min-h-screen bg-[#0B1120] text-white p-6 xl:p-10">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Factory size={44} className="text-[var(--cor-primaria)]" />
          <div>
            <h1 className="text-4xl xl:text-5xl font-black uppercase italic tracking-tighter text-[var(--cor-primaria)]">Produtividade da Fábrica</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">{empresa?.nome || 'WeGrow'}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-4xl font-black tabular-nums">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-slate-500 text-xs font-bold uppercase mt-1">{agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          </div>
          <button onClick={telaCheia} title="Tela cheia" className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400"><Maximize2 size={20} /></button>
        </div>
      </header>

      {/* Totais */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {[
          { l: 'Em produção', v: emProducao.length, ic: <Hammer size={13} />, c: 'text-amber-400', b: 'border-amber-500/20' },
          { l: 'Parados', v: paradas.length, ic: <AlertTriangle size={13} />, c: paradas.length ? 'text-red-400' : 'text-slate-500', b: paradas.length ? 'border-red-500/40' : 'border-white/10', destaque: paradas.length > 0 },
          { l: 'Etapas hoje', v: etapasHoje, ic: <ListChecks size={13} />, c: 'text-sky-400', b: 'border-sky-500/20' },
          { l: 'Aguardando entrega', v: aguardandoEntrega.length, ic: <CheckCircle2 size={13} />, c: 'text-blue-400', b: 'border-blue-500/20' },
          { l: 'Atrasadas', v: atrasadas.length, ic: <AlertTriangle size={13} />, c: atrasadas.length ? 'text-red-400' : 'text-slate-500', b: atrasadas.length ? 'border-red-500/40' : 'border-white/10', destaque: atrasadas.length > 0 },
          { l: 'Entregues hoje / 7d', v: `${entreguesHoje} / ${entreguesSemana}`, ic: <PackageCheck size={13} />, c: 'text-[var(--cor-primaria)]', b: 'border-[rgb(var(--cor-primaria-rgb)/30%)]' },
        ].map(k => (
          <div key={k.l} className={`bg-[#0F172A] border rounded-3xl p-5 ${k.b}`}>
            <p className={`text-xs font-black uppercase tracking-widest flex items-center gap-1.5 ${k.c}`}>{k.ic} {k.l}</p>
            <p className={`text-5xl font-black mt-2 tabular-nums ${k.destaque ? 'text-red-400' : 'text-white'}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
        {/* Linha de produção */}
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-300 text-sm font-black uppercase tracking-widest flex items-center gap-2"><Activity size={15} /> Linha de produção</p>
            {totalPaginas > 1 && (
              <div className="flex gap-1.5">{Array.from({ length: totalPaginas }).map((_, i) => <span key={i} className={`h-2 rounded-full transition-all ${i === paginaAtual ? 'w-6 bg-[var(--cor-primaria)]' : 'w-2 bg-white/15'}`} />)}</div>
            )}
          </div>
          {linha.length === 0 ? (
            <p className="text-slate-600 text-sm font-bold py-10 text-center">Nada em produção no momento.</p>
          ) : (
            <div className="space-y-2.5">
              {linhaVisivel.map(({ p, etapa, itens, feitos, diasEtapa, prazo, parado }) => {
                const estourou = prazo != null && !parado && diasEtapa > prazo;
                return (
                  <div key={p.id} className={`grid grid-cols-[120px_1fr_150px_120px] items-center gap-4 rounded-2xl px-4 py-3 border ${parado ? 'bg-red-500/10 border-red-500/30' : 'bg-white/[0.02] border-white/5'}`}>
                    <div className="min-w-0">
                      <p className="text-[var(--cor-primaria)] font-black text-lg leading-none">{pedido(p)}</p>
                      <p className="text-slate-400 text-xs font-bold truncate mt-1">{p.produto_final_nome}</p>
                    </div>
                    <div>
                      <div className="flex gap-1 mb-1.5">
                        {ETAPAS.map((et, i) => (
                          <div key={et} title={et} className={`h-2.5 flex-1 rounded-full ${i < p.etapa_fabricacao_idx ? 'bg-emerald-500' : i === p.etapa_fabricacao_idx ? (parado ? 'bg-red-500 animate-pulse' : 'bg-amber-400') : 'bg-white/10'}`} />
                        ))}
                      </div>
                      <p className={`text-sm font-black uppercase ${parado ? 'text-red-300' : 'text-white'}`}>
                        {etapa}{parado && <span className="text-red-400"> · aguardando início</span>}
                      </p>
                    </div>
                    <div className="text-center">
                      {itens > 0 ? (
                        <>
                          <p className={`text-2xl font-black tabular-nums ${feitos >= itens ? 'text-emerald-400' : 'text-white'}`}>{feitos}/{itens}</p>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1"><div className={`h-full rounded-full ${feitos >= itens ? 'bg-emerald-500' : 'bg-sky-400'}`} style={{ width: `${(feitos / itens) * 100}%` }} /></div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">checklist</p>
                        </>
                      ) : <p className="text-slate-600 text-xs font-bold">sem checklist</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black tabular-nums ${parado ? 'text-red-400' : estourou ? 'text-red-400' : 'text-white'}`}>
                        {diasEtapa}d{prazo != null && !parado && <span className="text-slate-500 text-base"> / {prazo}d</span>}
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{parado ? 'parado' : 'na etapa'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Parados */}
          {paradas.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-3xl p-6">
              <p className="text-red-300 text-sm font-black uppercase tracking-widest mb-3 flex items-center gap-2"><AlertTriangle size={15} /> Aguardando início</p>
              <div className="space-y-2">
                {paradas.slice(0, 5).map(({ p, d }) => (
                  <div key={p.id} className="flex items-center justify-between gap-3">
                    <span className="font-black">{pedido(p)} <span className="text-red-200/70 font-bold text-sm">· {ETAPAS[p.etapa_fabricacao_idx]}</span></span>
                    <span className={`font-black tabular-nums ${d >= 3 ? 'text-red-400' : 'text-amber-300'}`}>{d}d</span>
                  </div>
                ))}
                {paradas.length > 5 && <p className="text-red-300/70 text-xs font-bold">e mais {paradas.length - 5}</p>}
              </div>
            </div>
          )}

          {/* Gargalo */}
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6">
            <p className="text-slate-300 text-sm font-black uppercase tracking-widest mb-4">Onde está o gargalo</p>
            <div className="space-y-3">
              {porEtapa.map(e => (
                <div key={e.nome}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-sm font-bold uppercase">{e.nome}</span>
                    <span className="text-amber-400 font-black text-lg">{e.quantidade}</span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(e.quantidade / maxEtapa) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Últimas atividades */}
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6">
            <p className="text-slate-300 text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2"><Clock size={15} /> Últimas atividades</p>
            {atividades.length === 0 ? (
              <p className="text-slate-600 text-sm font-bold">Nenhuma atividade nos últimos dias.</p>
            ) : (
              <div className="space-y-2.5">
                {atividades.map(e => {
                  const p = prodPorId.get(e.producao_id);
                  return (
                    <div key={`${e.id}-${e.created_at}`} className="flex items-start gap-3 text-sm">
                      <span className="text-slate-500 font-bold tabular-nums w-14 shrink-0">{new Date(e.created_at) >= inicioHoje ? hora(e.created_at) : dataCurta(e.created_at)}</span>
                      <p className="min-w-0 text-slate-200 leading-snug">
                        {p && <b className="text-[var(--cor-primaria)]">{pedido(p)} </b>}
                        {(e.texto || '').replace(/\.$/, '')}
                        {e.user_id && nomes[e.user_id] && <span className="text-slate-500"> — {nomes[e.user_id]}</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fotos recentes */}
      {fotos.length > 0 && (
        <div className="mt-6 bg-[#0F172A] border border-white/10 rounded-3xl p-6">
          <p className="text-slate-300 text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2"><Camera size={15} /> Fotos recentes</p>
          <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
            {fotos.map(f => {
              const p = prodPorId.get(f.producao_id);
              return (
                <div key={f.id} className="relative rounded-2xl overflow-hidden border border-white/10 aspect-[4/3] bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.foto_url!} alt="" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 py-2">
                    <p className="text-xs font-black">{p ? pedido(p) : ''} <span className="text-slate-300 font-bold">· {dataCurta(f.created_at)}</span></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {atualizadoEm && (
        <p className="text-slate-700 text-[10px] font-bold uppercase tracking-widest text-center mt-6">
          Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR')} — atualiza sozinho a cada {REFRESH_MS / 1000}s
        </p>
      )}
    </div>
  );
}
