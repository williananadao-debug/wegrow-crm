"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Bell, Cake, Megaphone, AlertTriangle, Check, X, Search, BellRing, Send } from 'lucide-react';
import type { DiagnosticoAlertas } from '@/lib/aniversariosAlertas';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';
import {
  MidiaAniversarioMunicipio, MidiaAniversarioResultado, StatusVendaAniversario, LeadCrmResumo, DemaisFmAniversarioItem,
  STATUS_VENDA_LABELS, STATUS_VENDA_CORES, PRACAS, MESES_LABEL, diasAteProximaOcorrencia, fmtMoeda, normalizarNomeCidade,
} from '../shared';

// status da API do Leo → status interno do CRM (mesmo vocabulário, nomes iguais)
const STATUS_LEO_PARA_CRM: Record<string, StatusVendaAniversario> = {
  vendido: 'vendido', nao_vendido: 'nao_vendido', vendido_sem_valor: 'vendido_sem_valor', sem_registro: 'sem_registro',
};

const DIAS_ALERTA_ANIVERSARIO = 5;

export default function MidiaAniversariosPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);
  const isDiretor = perfil?.cargo === 'diretor';
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());

  // Verificar / enviar os alertas de aniversário (sino) na hora — mesmo processo do envio
  // automático diário, com diagnóstico de quem recebe e por que alguém não recebe.
  const [alertas, setAlertas] = useState<{ simulacao: boolean; diagnostico: DiagnosticoAlertas } | null>(null);
  const [rodandoAlertas, setRodandoAlertas] = useState<'simular' | 'enviar' | null>(null);
  const [erroAlertas, setErroAlertas] = useState<string | null>(null);
  const rodarAlertas = async (simular: boolean) => {
    setRodandoAlertas(simular ? 'simular' : 'enviar'); setErroAlertas(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/midia/aniversarios/alertas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ simular }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.erro || `Erro ${res.status}`);
      setAlertas(j);
    } catch (e) {
      setErroAlertas(e instanceof Error ? e.message : 'Erro ao verificar alertas.');
    } finally {
      setRodandoAlertas(null);
    }
  };
  const [aniversarios, setAniversarios] = useState<MidiaAniversarioMunicipio[]>([]);
  const [resultados, setResultados] = useState<MidiaAniversarioResultado[]>([]);
  const [leadsGanhos, setLeadsGanhos] = useState<LeadCrmResumo[]>([]);
  // 🔒 Dado confidencial do Leo (receita + nome de anunciante em `detalhe`) — só busca e
  // usa se for diretor/gerente; a API já bloqueia sozinha, isso aqui é defesa extra pra
  // nunca nem tentar carregar esse dado pra quem não devia ver.
  const [leoAniversarios, setLeoAniversarios] = useState<DemaisFmAniversarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState<{ status: StatusVendaAniversario; valor: string; observacao: string }>({ status: 'sem_registro', valor: '', observacao: '' });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id || !temMidia) return;
    setLoading(true);
    const [{ data: anivs }, { data: res }, { data: leads }] = await Promise.all([
      supabase.from('midia_aniversarios_municipios').select('*').eq('empresa_id', perfil.empresa_id).eq('ativo', true),
      supabase.from('midia_aniversarios_resultados').select('*').eq('empresa_id', perfil.empresa_id).eq('ano', ano),
      // Casa por cidade do lead + MÊS do aniversário (não o ano inteiro) — "receita de
      // aniversário" é o volume de venda que a cobertura do mês gerou, não venda com
      // alguma tag específica.
      supabase.from('leads').select('id, empresa, cidade, valor_total, vendedor_nome, created_at')
        .eq('empresa_id', perfil.empresa_id).eq('status', 'ganho')
        .gte('created_at', `${ano}-01-01T00:00:00`).lte('created_at', `${ano}-12-31T23:59:59`)
        .not('cidade', 'is', null),
    ]);
    setAniversarios((anivs as MidiaAniversarioMunicipio[]) || []);
    setResultados((res as MidiaAniversarioResultado[]) || []);
    setLeadsGanhos((leads as LeadCrmResumo[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id, temMidia, ano]);

  const carregarLeoAniversarios = useCallback(async () => {
    if (!isLideranca) { setLeoAniversarios([]); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/midia/demais-fm/aniversarios?ano=${ano}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) { setLeoAniversarios([]); return; }
      const json = await res.json();
      setLeoAniversarios(json.dados || []);
    } catch {
      setLeoAniversarios([]);
    }
  }, [isLideranca, ano]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarLeoAniversarios(); }, [carregarLeoAniversarios]);

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temMidia || !isDiretor) {
    return (
      <div className="md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-base">{!temMidia ? 'O módulo Demais FM Comercial não está ativo pra sua empresa ainda.' : 'Só diretor pode acessar essa área por enquanto (módulo em teste).'}</p>
        </div>
      </div>
    );
  }

  const resultadoDe = (aniversarioId: number): MidiaAniversarioResultado | null =>
    resultados.find(r => r.aniversario_id === aniversarioId) || null;

  // "Receita de aniversário" = todo lead ganho pra clientes daquela cidade, dentro do
  // MÊS do aniversário (não o ano inteiro) — é assim que a Demais FM mede: volume de
  // venda que a cobertura do aniversário do município gerou naquele mês, não venda
  // marcada com alguma tag específica.
  const leadsDoMunicipio = (a: MidiaAniversarioMunicipio): LeadCrmResumo[] => {
    const alvo = normalizarNomeCidade(a.municipio);
    return leadsGanhos.filter(l => normalizarNomeCidade(l.cidade || '') === alvo && (new Date(l.created_at).getMonth() + 1) === a.mes);
  };

  const ordenados = aniversarios
    .map(a => ({ ...a, diasRestantes: diasAteProximaOcorrencia(a.dia, a.mes) }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
  const urgentes = ordenados.filter(a => a.diasRestantes <= DIAS_ALERTA_ANIVERSARIO);

  const vendidosSemValor = aniversarios
    .map(a => ({ a, r: resultadoDe(a.id) }))
    .filter(({ r }) => r?.status === 'vendido_sem_valor');

  const iniciarEdicao = (aniversarioId: number) => {
    const r = resultadoDe(aniversarioId);
    setForm({ status: r?.status || 'sem_registro', valor: r?.valor?.toString() || '', observacao: r?.observacao || '' });
    setEditando(aniversarioId);
  };

  // 🔒 item.detalhe traz nome de anunciante — só usado dentro do form de edição, que já é
  // isLideranca-only; nunca renderizado nos cards de resumo (visíveis a qualquer usuário
  // do módulo mídia).
  const leoDe = (a: MidiaAniversarioMunicipio): DemaisFmAniversarioItem | null => {
    const alvo = normalizarNomeCidade(a.municipio);
    return leoAniversarios.find(item => item.mes === a.mes && normalizarNomeCidade(item.cidade) === alvo && (a.praca || '').includes(item.emissora)) || null;
  };

  const usarDadoDoLeo = (a: MidiaAniversarioMunicipio) => {
    const item = leoDe(a);
    if (!item) return;
    // receita_liquida null = sem registro (não confundir com "0.00" = confirmado zero) —
    // aviso explícito do Leo, respeitado aqui em vez de tratar null como 0.
    setForm({
      status: STATUS_LEO_PARA_CRM[item.status] || 'sem_registro',
      valor: item.receita_liquida != null ? item.receita_liquida : '',
      observacao: item.detalhe || '',
    });
    setEditando(a.id);
  };

  const usarValorDoCrm = (a: MidiaAniversarioMunicipio) => {
    const leads = leadsDoMunicipio(a);
    const total = leads.reduce((acc, l) => acc + Number(l.valor_total || 0), 0);
    const obs = leads.map(l => `${l.empresa} — R$ ${Number(l.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (lead #${l.id})`).join('; ');
    setForm({ status: 'vendido', valor: total.toString(), observacao: obs });
    setEditando(a.id);
  };

  const salvarResultado = async (aniversarioId: number) => {
    if (!perfil?.empresa_id) return;
    setSalvando(true);
    const { error } = await supabase.from('midia_aniversarios_resultados').upsert([{
      empresa_id: perfil.empresa_id, aniversario_id: aniversarioId, ano,
      status: form.status,
      valor: form.valor.trim() === '' ? null : Number(form.valor),
      observacao: form.observacao.trim() || null,
      criado_por: perfil.id, updated_at: new Date().toISOString(),
    }], { onConflict: 'aniversario_id,ano' });
    setSalvando(false);
    if (!error) { setEditando(null); carregar(); }
  };

  return (
    <div className="md:p-8 pb-20 text-white">
      <MidiaTabs />

      <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
        {isDiretor && (
          <>
            <button onClick={() => rodarAlertas(true)} disabled={rodandoAlertas !== null} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-slate-200 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest">
              {rodandoAlertas === 'simular' ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />} Verificar alertas
            </button>
            <button onClick={() => { if (window.confirm('Enviar agora os alertas de aniversário no sino dos vendedores? (quem já foi avisado não recebe de novo)')) rodarAlertas(false); }} disabled={rodandoAlertas !== null} className="flex items-center gap-2 bg-[#22C55E]/15 hover:bg-[#22C55E]/25 border border-[#22C55E]/30 disabled:opacity-50 text-[#22C55E] px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest">
              {rodandoAlertas === 'enviar' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar alertas agora
            </button>
          </>
        )}
        <select value={ano} onChange={e => setAno(Number(e.target.value))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold uppercase text-white outline-none focus:border-[#22C55E]">
          {[hoje.getFullYear() + 1, hoje.getFullYear(), hoje.getFullYear() - 1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {erroAlertas && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-2xl px-4 py-3 flex items-center gap-2"><AlertTriangle size={16} /> {erroAlertas}</div>
      )}
      {alertas && (() => {
        const d = alertas.diagnostico;
        return (
          <div className="mb-6 bg-[#0B1120] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2"><BellRing size={14} /> {alertas.simulacao ? 'Verificação dos alertas (nada foi enviado)' : 'Alertas enviados'}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {d.cidadesAtivas} cidade(s) ativa(s) · avisos {d.limites.slice().sort((a, b) => b - a).map(l => l === 0 ? 'no dia' : `${l}d antes`).join(', ')} ·{' '}
                  {alertas.simulacao ? `${d.notificacoesNovas} aviso(s) novo(s) seriam enviados` : `${d.notificacoesNovas} aviso(s) enviado(s)`}{d.jaAvisadas ? ` · ${d.jaAvisadas} já tinham sido avisados antes` : ''}
                </p>
              </div>
              <button onClick={() => setAlertas(null)} className="text-slate-500 hover:text-white"><X size={16} /></button>
            </div>
            {d.erros.length > 0 && (
              <ul className="space-y-1">{d.erros.map(e => <li key={e} className="text-xs text-red-300 font-bold flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e}</li>)}</ul>
            )}
            {d.cidadesNoPrazo.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma cidade dentro do prazo de aviso hoje — o próximo aviso sai {d.limites.length ? `quando faltar ${Math.max(...d.limites)} dias` : 'no prazo configurado'} para o próximo aniversário.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {d.cidadesNoPrazo.map(c => (
                  <li key={c.municipio + c.data} className="py-2 text-xs flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-black text-white">{c.municipio}</span>
                    <span className="text-slate-400">{c.data} · {c.dias === 0 ? 'hoje' : `faltam ${c.dias} dias`}</span>
                    <span className={c.destinatarios.length ? 'text-slate-300' : 'text-amber-300 font-bold'}>
                      {c.destinatarios.length ? `Avisa: ${c.destinatarios.join(', ')}` : 'Ninguém recebe esta cidade (sem diretor/cluster/praça que a cubra)'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {d.semCobertura.length > 0 && (
              <p className="text-xs text-amber-300 border-t border-white/5 pt-2">
                <b>Não recebem nenhum alerta</b> (sem cidades no Cluster e sem praça 101.1/104.7/107.9 na unidade): {d.semCobertura.map(p => `${p.nome}${p.unidade ? ` (unidade: ${p.unidade})` : ''}`).join(', ')}. Ajuste em <Link href="/midia/clusters" className="underline">Clusters</Link>.
              </p>
            )}
          </div>
        );
      })()}

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : ordenados.length === 0 ? (
        <div className="bg-[#0B1120] border border-white/10 rounded-3xl p-10 text-center">
          <Cake size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-base mb-3">Nenhuma cidade cadastrada ainda.</p>
          {isLideranca && <Link href="/midia/configuracoes" className="inline-block bg-[#22C55E] hover:bg-[#22C55E] text-white px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest">Cadastrar em Configurações</Link>}
        </div>
      ) : (
        <>
          {urgentes.length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap mb-4">
              <Bell size={16} className="text-emerald-400 shrink-0 animate-pulse" />
              <p className="text-emerald-300 text-sm font-black uppercase tracking-wide flex-1">
                {urgentes.length} aniversário{urgentes.length > 1 ? 's' : ''} de município nos próximos {DIAS_ALERTA_ANIVERSARIO} dias:
                <span className="text-white ml-2">
                  {urgentes.map(a => `${a.municipio} (${a.diasRestantes === 0 ? 'hoje' : `${a.diasRestantes}d`})`).join(' · ')}
                </span>
              </p>
            </div>
          )}

          {/* CARDS DE RECEITA POR PRAÇA */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {PRACAS.map(praca => {
              const daPraca = aniversarios.filter(a => (a.praca || '').includes(praca));
              const comResultado = daPraca.map(a => ({ a, r: resultadoDe(a.id) }));
              const receita = comResultado.reduce((acc, { r }) => acc + (r?.status === 'vendido' ? Number(r.valor || 0) : 0), 0);
              const contagem = (status: StatusVendaAniversario) => comResultado.filter(({ r }) => (r?.status || 'sem_registro') === status).length;
              return (
                <div key={praca} className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-black uppercase text-[#22C55E] bg-[#22C55E]/10 px-2.5 py-1 rounded-full">{praca} FM</span>
                    <span className="text-[10px] font-black uppercase text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Uso Interno</span>
                  </div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Receita de aniversários ({ano})</p>
                  <h3 className="text-3xl font-black text-white mt-0.5">{fmtMoeda(receita)}</h3>
                  <div className="border-t border-white/5 mt-3 pt-3 space-y-1">
                    <div className="flex justify-between text-[12px]"><span className="text-slate-500 font-bold">Não vendido</span><span className="text-slate-300 font-black">{contagem('nao_vendido')}</span></div>
                    <div className="flex justify-between text-[12px]"><span className="text-slate-500 font-bold">Sem registro</span><span className="text-slate-300 font-black">{contagem('sem_registro')}</span></div>
                    <div className="flex justify-between text-[12px]"><span className="text-[#22C55E] font-bold">Vendido</span><span className="text-[#22C55E] font-black">{contagem('vendido')}</span></div>
                    <div className="flex justify-between text-[12px]"><span className="text-blue-400 font-bold">Vendido s/ valor</span><span className="text-blue-400 font-black">{contagem('vendido_sem_valor')}</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {vendidosSemValor.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-start gap-3 mb-6">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-200 text-sm font-semibold">
                {vendidosSemValor.length} aniversário{vendidosSemValor.length > 1 ? 's estão registrados' : ' está registrado'} como vendido sem valor informado
                ({vendidosSemValor.map(({ a }) => a.municipio).join(', ')}). Os totais acima são, portanto, um piso — a receita real foi maior.
              </p>
            </div>
          )}

          {/* LISTA POR PRAÇA, AGRUPADA POR MÊS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {PRACAS.map(praca => {
              const daPraca = ordenados.filter(a => (a.praca || '').includes(praca)).sort((a, b) => a.mes - b.mes || a.dia - b.dia);
              return (
                <div key={praca} className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-black uppercase text-[#22C55E] bg-[#22C55E]/10 px-2.5 py-1 rounded-full">{praca} FM</span>
                    <h3 className="text-base font-black text-white">Aniversários {ano}</h3>
                  </div>
                  <div className="space-y-4">
                    {(() => {
                      let mesAtual: number | null = null;
                      return daPraca.map(a => {
                        const r = resultadoDe(a.id);
                        const status: StatusVendaAniversario = r?.status || 'sem_registro';
                        const mostrarMes = a.mes !== mesAtual;
                        mesAtual = a.mes;
                        const leadsCrm = leadsDoMunicipio(a);
                        const totalCrm = leadsCrm.reduce((acc, l) => acc + Number(l.valor_total || 0), 0);
                        const crmDivergeDoResultado = leadsCrm.length > 0 && (status !== 'vendido' || Number(r?.valor || 0) !== totalCrm);
                        const leo = leoDe(a);
                        const leoDivergeDoResultado = leo && (STATUS_LEO_PARA_CRM[leo.status] !== status || (leo.receita_liquida != null && Number(leo.receita_liquida) !== Number(r?.valor || 0)));
                        return (
                          <div key={a.id}>
                            {mostrarMes && <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">{MESES_LABEL[a.mes - 1]}</p>}
                            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-base font-bold text-white truncate">{a.municipio}</p>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_VENDA_CORES[status]}`}>{STATUS_VENDA_LABELS[status]}</span>
                              </div>
                              {status === 'vendido' && <p className="text-base font-black text-[#22C55E] mt-1">{fmtMoeda(r?.valor)}</p>}
                              {r?.observacao && <p className="text-[12px] text-slate-500 mt-1">{r.observacao}</p>}

                              {crmDivergeDoResultado && (
                                <div className="mt-2 bg-blue-500/10 border border-blue-500/25 rounded-lg px-2.5 py-2 flex items-center justify-between gap-2">
                                  <p className="text-[11px] text-blue-300 font-bold flex items-center gap-1"><Search size={10} /> CRM: {fmtMoeda(totalCrm)} em {leadsCrm.length} venda(s) de {MESES_LABEL[a.mes - 1]}/{ano}</p>
                                  {isLideranca && <button onClick={() => usarValorDoCrm(a)} className="text-[11px] font-black uppercase text-blue-400 hover:text-blue-300 whitespace-nowrap">Usar valor →</button>}
                                </div>
                              )}

                              {isLideranca && leoDivergeDoResultado && (
                                <div className="mt-2 bg-[#22C55E]/10 border border-[#22C55E]/25 rounded-lg px-2.5 py-2 flex items-center justify-between gap-2">
                                  <p className="text-[11px] text-[#22C55E] font-bold flex items-center gap-1">
                                    <Search size={10} /> IAlto: {STATUS_VENDA_LABELS[STATUS_LEO_PARA_CRM[leo!.status]]}{leo!.receita_liquida != null ? ` · ${fmtMoeda(Number(leo!.receita_liquida))}` : ''}
                                  </p>
                                  <button onClick={() => usarDadoDoLeo(a)} className="text-[11px] font-black uppercase text-[#22C55E] hover:text-white whitespace-nowrap">Usar dado →</button>
                                </div>
                              )}

                              {isLideranca && editando !== a.id && (
                                <button onClick={() => iniciarEdicao(a.id)} className="text-[11px] font-black uppercase text-slate-600 hover:text-[#22C55E] mt-2">Editar resultado</button>
                              )}

                              {editando === a.id && (
                                <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
                                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as StatusVendaAniversario })} className="w-full bg-[#0B1120] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] font-bold uppercase text-white outline-none">
                                    {Object.entries(STATUS_VENDA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </select>
                                  {form.status === 'vendido' && (
                                    <input type="number" step="0.01" placeholder="Valor R$" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} className="w-full bg-[#0B1120] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-white outline-none" />
                                  )}
                                  <textarea placeholder="Observação (opcional)" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} rows={2} className="w-full bg-[#0B1120] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white outline-none resize-none" />
                                  <div className="flex gap-1.5">
                                    <button onClick={() => salvarResultado(a.id)} disabled={salvando} className="flex-1 bg-[#22C55E] hover:bg-[#22C55E] disabled:opacity-50 text-white py-1.5 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-1">
                                      {salvando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Salvar
                                    </button>
                                    <button onClick={() => setEditando(null)} className="px-3 bg-white/5 hover:bg-white/10 text-slate-400 py-1.5 rounded-lg text-[11px] font-black uppercase"><X size={11} /></button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                    {daPraca.length === 0 && <p className="text-[12px] text-slate-600 font-bold">Nenhuma cidade cadastrada pra essa praça.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
