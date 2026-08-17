"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Megaphone, Loader2, RefreshCw, Instagram, Youtube, Smartphone, DollarSign, Radio, Newspaper, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from './MidiaTabs';
import {
  MidiaMetricasMensais, YoutubeInsightsResposta,
  DemaisFmAudienciaResposta, DemaisFmSiteResposta, DemaisFmAppDownloadsResposta, DemaisFmMonetizacaoResposta, DemaisFmRedesSociaisResposta,
  MESES_LABEL, fmtCompacto, fmtMoeda, fmtNumero,
} from './shared';

const fmtPeriodo = (periodo: string | null | undefined) => {
  if (!periodo) return '—';
  const [anoStr, mesStr] = periodo.split('-');
  return `${MESES_LABEL[Number(mesStr) - 1]}/${anoStr}`;
};

export default function MidiaPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);
  const isDiretor = perfil?.cargo === 'diretor';

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);

  const [metricas, setMetricas] = useState<MidiaMetricasMensais | null>(null);
  const [historico, setHistorico] = useState<MidiaMetricasMensais[]>([]);
  const [youtube, setYoutube] = useState<YoutubeInsightsResposta | null>(null);
  const [erroYoutube, setErroYoutube] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [carregandoYoutube, setCarregandoYoutube] = useState(false);

  const [audienciaFm, setAudienciaFm] = useState<DemaisFmAudienciaResposta | null>(null);
  const [erroAudienciaFm, setErroAudienciaFm] = useState<string | null>(null);
  const [carregandoAudienciaFm, setCarregandoAudienciaFm] = useState(false);
  const [siteFm, setSiteFm] = useState<DemaisFmSiteResposta | null>(null);
  const [erroSiteFm, setErroSiteFm] = useState<string | null>(null);
  const [carregandoSiteFm, setCarregandoSiteFm] = useState(false);
  const [appDownloadsFm, setAppDownloadsFm] = useState<DemaisFmAppDownloadsResposta | null>(null);
  const [erroAppDownloadsFm, setErroAppDownloadsFm] = useState<string | null>(null);
  const [carregandoAppDownloadsFm, setCarregandoAppDownloadsFm] = useState(false);
  const [monetizacaoFm, setMonetizacaoFm] = useState<DemaisFmMonetizacaoResposta | null>(null);
  const [erroMonetizacaoFm, setErroMonetizacaoFm] = useState<string | null>(null);
  const [carregandoMonetizacaoFm, setCarregandoMonetizacaoFm] = useState(false);
  // Endpoint ainda não existe no Leo (ver src/lib/demais-fm-api.ts) — 501 é esperado hoje,
  // por isso não guarda erro nem mostra nada de "falha": cai quieto pro dado manual, que
  // continua sendo salvo normalmente em Configurações até isso ligar de verdade.
  const [redesSociaisFm, setRedesSociaisFm] = useState<DemaisFmRedesSociaisResposta | null>(null);

  const carregarManual = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: atual }, { data: hist }] = await Promise.all([
      supabase.from('midia_metricas_mensais').select('*').eq('empresa_id', perfil.empresa_id).eq('ano', ano).eq('mes', mes).maybeSingle(),
      supabase.from('midia_metricas_mensais').select('*').eq('empresa_id', perfil.empresa_id).order('ano', { ascending: true }).order('mes', { ascending: true }).limit(12),
    ]);
    setMetricas(atual as MidiaMetricasMensais | null);
    setHistorico((hist as MidiaMetricasMensais[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id, ano, mes]);

  const carregarRedesSociaisFm = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/midia/demais-fm/redes-sociais', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) { setRedesSociaisFm(null); return; } // sem config/erro — cai pro manual
      setRedesSociaisFm(await res.json());
    } catch {
      setRedesSociaisFm(null);
    }
  }, []);

  const carregarYoutube = useCallback(async () => {
    setCarregandoYoutube(true);
    setErroYoutube(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/midia/youtube', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar YouTube.');
      setYoutube(json);
    } catch (err: any) {
      setYoutube(null);
      setErroYoutube(err?.message || 'Erro ao buscar YouTube.');
    } finally {
      setCarregandoYoutube(false);
    }
  }, []);

  const carregarAudienciaFm = useCallback(async () => {
    setCarregandoAudienciaFm(true);
    setErroAudienciaFm(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/midia/demais-fm/audiencia', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar audiência.');
      setAudienciaFm(json);
    } catch (err: any) {
      setAudienciaFm(null);
      setErroAudienciaFm(err?.message || 'Erro ao buscar audiência.');
    } finally {
      setCarregandoAudienciaFm(false);
    }
  }, []);

  const carregarSiteFm = useCallback(async () => {
    setCarregandoSiteFm(true);
    setErroSiteFm(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      // Sem ano/mes na chamada de propósito: a API do Leo retorna ERRO (não vazio) quando o
      // período pedido ainda não foi ingerido — pedindo a série toda, o fallback pro mês
      // mais recente disponível (abaixo) sempre tem o que precisa pra funcionar.
      const res = await fetch('/api/midia/demais-fm/site', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar site.');
      setSiteFm(json);
    } catch (err: any) {
      setSiteFm(null);
      setErroSiteFm(err?.message || 'Erro ao buscar site.');
    } finally {
      setCarregandoSiteFm(false);
    }
  }, []);

  const carregarAppDownloadsFm = useCallback(async () => {
    setCarregandoAppDownloadsFm(true);
    setErroAppDownloadsFm(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/midia/demais-fm/app-downloads', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar downloads do app.');
      setAppDownloadsFm(json);
    } catch (err: any) {
      setAppDownloadsFm(null);
      setErroAppDownloadsFm(err?.message || 'Erro ao buscar downloads do app.');
    } finally {
      setCarregandoAppDownloadsFm(false);
    }
  }, []);

  const carregarMonetizacaoFm = useCallback(async () => {
    setCarregandoMonetizacaoFm(true);
    setErroMonetizacaoFm(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/midia/demais-fm/monetizacao', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar monetização.');
      setMonetizacaoFm(json);
    } catch (err: any) {
      setMonetizacaoFm(null);
      setErroMonetizacaoFm(err?.message || 'Erro ao buscar monetização.');
    } finally {
      setCarregandoMonetizacaoFm(false);
    }
  }, []);

  useEffect(() => {
    if (!temMidia) return;
    carregarManual(); carregarYoutube(); carregarAudienciaFm(); carregarSiteFm(); carregarRedesSociaisFm();
    if (isDiretor) { carregarAppDownloadsFm(); carregarMonetizacaoFm(); }
  }, [temMidia, isDiretor, carregarManual, carregarYoutube, carregarAudienciaFm, carregarSiteFm, carregarRedesSociaisFm, carregarAppDownloadsFm, carregarMonetizacaoFm]);

  const audienciaRede = audienciaFm?.dados.find(d => d.emissora === 'REDE') || null;

  // A ingestão da Demais FM é mensal e às vezes atrasa alguns dias — se o mês selecionado
  // (por padrão o mês corrente) ainda não tiver dado, cai pro mês mais recente disponível
  // em vez de mostrar vazio. O rótulo mostrado usa o período real do dado, não o do seletor
  // — mesmo padrão do painel do Leo, que rotula fixo "JULHO/2026" em vez de assumir o mês atual.
  const periodoSelecionado = `${ano}-${String(mes).padStart(2, '0')}`;
  const siteOrdenado = [...(siteFm?.dados || [])].sort((a, b) => b.periodo.localeCompare(a.periodo));
  const siteMesAtual = siteOrdenado.find(d => d.periodo === periodoSelecionado) || siteOrdenado[0] || null;

  // Mesma lógica pros campos manuais (YouTube da rede, Instagram Demais News) — se
  // ninguém preencheu o mês selecionado ainda, cai pro mês mais recente que tem dado
  // preenchido em vez de mostrar tudo zerado.
  const historicoOrdenado = [...historico].sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes));
  const metricasEfetivas = metricas || historicoOrdenado[0] || null;
  const metricasEhFallback = Boolean(!metricas && metricasEfetivas);

  // totais_rede já vem só com as 3 emissoras somadas (Instagram Demais News fica de fora
  // de propósito, ver spec 2.3) — some Instagram+Facebook aqui só pra virar 1 número de
  // "redes sociais da rede" no card. Cai pro mês mais recente disponível se o selecionado
  // ainda não tiver ingestão, mesmo padrão usado pros outros dados do Leo nesta página.
  const periodosRedesDisponiveis = Array.from(new Set((redesSociaisFm?.totais_rede || []).map(t => t.periodo))).sort();
  const periodoRedesEfetivo = periodosRedesDisponiveis.includes(periodoSelecionado)
    ? periodoSelecionado
    : periodosRedesDisponiveis[periodosRedesDisponiveis.length - 1];
  const totaisDoPeriodoRedes = (redesSociaisFm?.totais_rede || []).filter(t => t.periodo === periodoRedesEfetivo);
  const somarSeAlgumNaoNulo = (campo: 'visualizacoes' | 'interacoes' | 'visitas') => {
    const valores = totaisDoPeriodoRedes.map(t => t[campo]).filter((v): v is number => v != null);
    return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) : null;
  };

  // Prefere o dado ao vivo do Leo assim que ele existir; até lá cai pro manual sem
  // ninguém precisar mudar nada na tela.
  const redesSociais = redesSociaisFm && periodoRedesEfetivo
    ? { visualizacoes: somarSeAlgumNaoNulo('visualizacoes'), interacoes: somarSeAlgumNaoNulo('interacoes'), visitasPerfil: somarSeAlgumNaoNulo('visitas'), periodo: periodoRedesEfetivo, aoVivo: true }
    : metricasEfetivas?.redes_sociais_visualizacoes != null
      ? { visualizacoes: metricasEfetivas.redes_sociais_visualizacoes, interacoes: metricasEfetivas.redes_sociais_interacoes, visitasPerfil: metricasEfetivas.redes_sociais_visitas_perfil, periodo: `${metricasEfetivas.ano}-${String(metricasEfetivas.mes).padStart(2, '0')}`, aoVivo: false }
      : null;

  // Nunca soma mensal com acumulado (o acumulado já contém os mensais — aviso do Leo) e
  // nunca soma Apple com Android num único número: a unidade pode divergir entre lojas
  // (ex: Android às vezes vem como "instalações ativas", não "downloads").
  const appDownloadsAcumulado = (appDownloadsFm?.dados || []).filter(d => d.escopo === 'acumulado');
  const appDownloadsMensal = [...(appDownloadsFm?.dados || [])].filter(d => d.escopo === 'mensal').sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));

  const monetizacaoOrdenada = [...(monetizacaoFm?.dados || [])].filter(d => d.escopo === 'mensal').sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));
  const monetizacaoMesAtual = monetizacaoOrdenada.find(d => d.periodo === periodoSelecionado) || monetizacaoOrdenada[0] || null;
  const monetizacaoAcumulado = monetizacaoFm?.dados.find(d => d.escopo === 'acumulado') || null;

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temMidia) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-base">O módulo Demais FM Comercial não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  const graficoMeses = MESES_LABEL.map((label, i) => {
    const item = historico.find(h => h.mes === i + 1 && h.ano === ano);
    return { label, valor: item?.youtube_visualizacoes || 0 };
  });
  const maxGrafico = Math.max(...graficoMeses.map(m => m.valor), 1);

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <MidiaTabs />

      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-white">Visão Geral</h2>
          <p className="text-[13px] text-slate-500 font-bold mt-0.5">Indicadores de rede — audiência, redes sociais e prestação de contas do mês.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold uppercase text-white outline-none focus:border-[#22C55E]">
            {MESES_LABEL.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
          </select>
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold uppercase text-white outline-none focus:border-[#22C55E]">
            {[hoje.getFullYear(), hoje.getFullYear() - 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* REDE EM CADEIA — estimado */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Radio size={13} /> Rede em cadeia</p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Estimado</span>
                <button onClick={carregarAudienciaFm} disabled={carregandoAudienciaFm} className="text-slate-500 hover:text-white transition-colors">
                  <RefreshCw size={12} className={carregandoAudienciaFm ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            {erroAudienciaFm ? (
              <p className="text-[13px] text-amber-400 font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> {erroAudienciaFm}</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-4xl font-black text-amber-400">{fmtNumero(audienciaRede?.ouvintes_por_minuto)}</h3>
                  <span className="text-sm text-slate-400 font-bold">ouvintes por minuto</span>
                </div>
                <p className="text-[12px] text-slate-500 font-semibold mt-2">Cálculo por parâmetros médios de mercado, apenas população das cidades sede — com cidades vizinhas o alcance é maior.</p>
                {audienciaFm && (
                  <p className="text-[11px] text-slate-600 font-bold mt-2">Fonte: {audienciaRede?.fonte || '—'} · atualizado em {audienciaFm.atualizado_em ? new Date(audienciaFm.atualizado_em).toLocaleDateString('pt-BR') : '—'}</p>
                )}
              </>
            )}
          </div>

          {/* REDES SOCIAIS — ao vivo assim que o Leo expuser o endpoint; manual até lá */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Instagram size={13} /> Redes sociais{redesSociais?.periodo ? ` — ${fmtPeriodo(redesSociais.periodo)}` : ''}</p>
              {redesSociais?.aoVivo ? (
                <span className="text-[11px] font-black uppercase text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">Ao vivo</span>
              ) : (
                <span className="text-[11px] font-black uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Manual</span>
              )}
            </div>
            {!redesSociais ? (
              <p className="text-[13px] text-slate-500 font-bold">Sem dados — cadastre em Configurações.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <h3 className="text-4xl font-black text-[#22C55E]">{fmtCompacto(redesSociais.visualizacoes)}</h3>
                  <span className="text-sm text-slate-400 font-bold">visualizações</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><h4 className="text-xl font-black text-white">{fmtCompacto(redesSociais.interacoes)}</h4><p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Interações</p></div>
                  <div><h4 className="text-xl font-black text-white">{fmtCompacto(redesSociais.visitasPerfil)}</h4><p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Visitas ao perfil</p></div>
                </div>
                <p className="text-[12px] text-slate-600 font-semibold mt-3">
                  {redesSociais.aoVivo
                    ? 'Soma de Instagram + Facebook das três emissoras — ao vivo da API Demais FM Comercial.'
                    : 'Soma de Instagram + Facebook das três emissoras — número pronto do painel do Leo/IAlto, digitado manualmente aqui por enquanto.'}
                </p>
              </>
            )}
          </div>

          {/* DEMAIS NEWS — site + instagram próprio, split */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Newspaper size={13} /> Demais News</p>
              <span className="text-[11px] font-black uppercase text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">Medido</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:border-r md:border-white/5 md:pr-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Site</p>
                  <button onClick={carregarSiteFm} disabled={carregandoSiteFm} className="text-slate-500 hover:text-white transition-colors">
                    <RefreshCw size={11} className={carregandoSiteFm ? 'animate-spin' : ''} />
                  </button>
                </div>
                {erroSiteFm ? (
                  <p className="text-[13px] text-amber-400 font-bold flex items-center gap-1.5"><AlertTriangle size={12} /> {erroSiteFm}</p>
                ) : siteMesAtual?.visitas == null ? (
                  <p className="text-[13px] text-slate-500 font-bold">Mês ainda não ingerido pela Demais FM.</p>
                ) : (
                  <>
                    <h3 className="text-4xl font-black text-white">{fmtNumero(siteMesAtual.visitas)}</h3>
                    <p className="text-[12px] text-slate-500 font-bold mt-0.5">acessos · {fmtPeriodo(siteMesAtual.periodo)}{siteMesAtual.periodo !== periodoSelecionado ? ' (mais recente disponível)' : ''}</p>
                    {siteOrdenado.length > 1 && (
                      <div className="flex items-end gap-1 h-10 mt-3">
                        {[...siteOrdenado].reverse().map(d => {
                          const maxSite = Math.max(...siteOrdenado.map(x => x.visitas || 0), 1);
                          const v = d.visitas || 0;
                          return (
                            <div key={d.periodo} className="flex-1 flex flex-col items-center gap-0.5 group">
                              <div className="w-full rounded-t bg-[#22C55E]/50 group-hover:bg-[#22C55E] transition-all" style={{ height: `${Math.max((v / maxSite) * 100, v > 0 ? 4 : 0)}%` }} title={`${fmtPeriodo(d.periodo)}: ${fmtNumero(v)}`} />
                              <span className="text-[8px] text-slate-600 font-bold uppercase">{MESES_LABEL[Number(d.periodo.split('-')[1]) - 1]}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1">Instagram Demais News</p>
                <h3 className="text-4xl font-black text-white">{fmtCompacto(metricasEfetivas?.instagram_demais_news_visualizacoes)}</h3>
                <p className="text-[12px] text-slate-500 font-bold mt-0.5">
                  {fmtNumero(metricasEfetivas?.instagram_demais_news_interacoes)} interações · {fmtNumero(metricasEfetivas?.instagram_demais_news_seguidores)} seguidores
                  {metricasEhFallback && metricasEfetivas ? ` · ${MESES_LABEL[metricasEfetivas.mes - 1]}/${metricasEfetivas.ano} (mais recente preenchido)` : ''}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 font-semibold mt-3 pt-3 border-t border-white/5">O Demais News é propriedade distinta das três emissoras — esses números não entram na soma do card de redes sociais acima.</p>
          </div>

          {/* YOUTUBE DA REDE — automático (Google, canal conectado) + canal ao vivo + mini gráfico */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Youtube size={13} /> YouTube da Rede — {MESES_LABEL[mes - 1]}/{ano}</p>
              <span className="text-[11px] font-black uppercase text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">Automático</span>
            </div>
            <div className="flex flex-col md:flex-row md:items-end gap-5">
              <div className="flex-shrink-0">
                <h3 className="text-4xl font-black text-white">{fmtCompacto(metricasEfetivas?.youtube_visualizacoes)}</h3>
                <p className="text-[12px] text-slate-500 font-bold mt-1">
                  visualizações{metricasEhFallback && metricasEfetivas ? ` · ${MESES_LABEL[metricasEfetivas.mes - 1]}/${metricasEfetivas.ano} (mais recente preenchido)` : ' no mês'}
                </p>
                {metricasEfetivas?.youtube_observacoes && <p className="text-[12px] text-slate-500 mt-2 italic max-w-xs">{metricasEfetivas.youtube_observacoes}</p>}
              </div>
              <div className="flex-1 flex items-end gap-1.5 h-16 min-w-[200px]">
                {graficoMeses.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full rounded-t bg-[#22C55E]/50 group-hover:bg-[#22C55E] transition-all" style={{ height: `${Math.max((m.valor / maxGrafico) * 100, m.valor > 0 ? 4 : 0)}%` }} title={`${m.label}: ${fmtNumero(m.valor)}`} />
                    <span className="text-[9px] text-slate-600 font-bold uppercase">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/5 mt-3 pt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black uppercase text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">Canal ao vivo</span>
                <button onClick={carregarYoutube} disabled={carregandoYoutube} className="text-slate-500 hover:text-white transition-colors">
                  <RefreshCw size={12} className={carregandoYoutube ? 'animate-spin' : ''} />
                </button>
              </div>
              {erroYoutube ? (
                <p className="text-[12px] text-amber-400 font-bold flex items-center gap-1"><AlertTriangle size={11} /> {erroYoutube}</p>
              ) : youtube ? (
                <p className="text-[13px] text-slate-400 font-bold">{fmtNumero(youtube.inscritos)} inscritos · {fmtCompacto(youtube.visualizacoesTotais)} views totais (histórico do canal)</p>
              ) : (
                <p className="text-[12px] text-slate-600 font-bold">Carregando...</p>
              )}
            </div>
          </div>

          {/* DOWNLOADS DO APP — uso interno */}
          {isDiretor && (
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Smartphone size={13} /> Downloads do App</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">Uso Interno</span>
                  <button onClick={carregarAppDownloadsFm} disabled={carregandoAppDownloadsFm} className="text-slate-500 hover:text-white transition-colors">
                    <RefreshCw size={12} className={carregandoAppDownloadsFm ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              {erroAppDownloadsFm ? (
                <p className="text-[13px] text-amber-400 font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> {erroAppDownloadsFm}</p>
              ) : appDownloadsAcumulado.length === 0 ? (
                <p className="text-[13px] text-slate-500 font-bold">Sem dados.</p>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row md:items-center gap-5">
                    <div className="flex-shrink-0">
                      <h3 className="text-4xl font-black text-amber-400">{fmtNumero(appDownloadsAcumulado.reduce((acc, d) => acc + d.valor, 0))}</h3>
                      <p className="text-[12px] text-slate-500 font-bold mt-1">downloads · total acumulado{appDownloadsMensal[0] ? ` até ${fmtPeriodo(appDownloadsMensal[0].periodo)}` : ''}</p>
                      <p className="text-[12px] text-slate-400 font-bold mt-2">
                        {appDownloadsAcumulado.map((d, i) => (<span key={d.loja}>{i > 0 ? ' · ' : ''}{d.loja} {fmtNumero(d.valor)}</span>))}
                      </p>
                    </div>

                    {appDownloadsMensal.length > 0 && (() => {
                      const periodos = [...new Set(appDownloadsMensal.map(d => d.periodo))].sort();
                      const r = 34, c = 2 * Math.PI * r;
                      return (
                        <div className="flex-1 flex flex-wrap items-start gap-7 md:border-l md:border-white/5 md:pl-6">
                          {periodos.map(p => {
                            const apple = appDownloadsMensal.find(d => d.periodo === p && d.loja === 'Apple');
                            const android = appDownloadsMensal.find(d => d.periodo === p && d.loja === 'Android');
                            const av = apple?.valor || 0, dv = android?.valor || 0, total = av + dv;
                            const appleFrac = total > 0 ? av / total : 0;
                            return (
                              <div key={p} className="flex flex-col items-center gap-2">
                                <div className="relative w-24 h-24">
                                  <svg viewBox="0 0 90 90" width="96" height="96" className="-rotate-90">
                                    <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="14" />
                                    <circle cx="45" cy="45" r={r} fill="none" stroke="#fff" strokeWidth="14" strokeDasharray={`${appleFrac * c} ${c}`} strokeLinecap="butt">
                                      <title>{`Apple ${fmtNumero(av)} ${apple?.unidade || ''}`}</title>
                                    </circle>
                                    <circle cx="45" cy="45" r={r} fill="none" stroke="#fbbf24" strokeWidth="14" strokeDasharray={`${(1 - appleFrac) * c} ${c}`} strokeDashoffset={-(appleFrac * c)} strokeLinecap="butt">
                                      <title>{`Android ${fmtNumero(dv)} ${android?.unidade || ''}`}</title>
                                    </circle>
                                  </svg>
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-base font-black text-white">{fmtCompacto(total)}</span>
                                  </div>
                                </div>
                                <span className="text-[11px] text-slate-500 font-bold uppercase">{fmtPeriodo(p)}</span>
                              </div>
                            );
                          })}
                          <div className="flex flex-col gap-1 justify-center">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-white" /> Apple</span>
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Android</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <p className="text-[11px] text-slate-600 font-semibold mt-3 pt-3 border-t border-white/5">
                    Acumulado e mensal nunca são somados entre si — o acumulado já contém os meses.
                    {appDownloadsMensal.some(d => d.unidade !== 'downloads') ? ' Atenção: pelo menos um mês veio como unidade diferente de "downloads" (ex: "instalações ativas") — confira antes de comparar meses.' : ''}
                  </p>
                </>
              )}
            </div>
          )}

          {/* MONETIZAÇÃO DIGITAL — uso interno */}
          {isDiretor && (
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><DollarSign size={13} /> Monetização Digital</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">Uso Interno</span>
                  <button onClick={carregarMonetizacaoFm} disabled={carregandoMonetizacaoFm} className="text-slate-500 hover:text-white transition-colors">
                    <RefreshCw size={12} className={carregandoMonetizacaoFm ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              {erroMonetizacaoFm ? (
                <p className="text-[13px] text-amber-400 font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> {erroMonetizacaoFm}</p>
              ) : (
                <>
                  <div className="flex items-end gap-6 flex-wrap">
                    <div>
                      <h3 className="text-4xl font-black text-red-400">{fmtMoeda(monetizacaoMesAtual ? Number(monetizacaoMesAtual.valor) : null)}</h3>
                      <p className="text-[12px] text-slate-500 font-bold mt-1">
                        receita líquida do mês · {fmtPeriodo(monetizacaoMesAtual?.periodo)}{monetizacaoMesAtual && monetizacaoMesAtual.periodo !== periodoSelecionado ? ' (mais recente disponível)' : ''}
                      </p>
                    </div>
                    {monetizacaoAcumulado && (
                      <div>
                        <h4 className="text-xl font-black text-white">{fmtMoeda(Number(monetizacaoAcumulado.valor))}</h4>
                        <p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Acumulado</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 font-semibold mt-3 pt-3 border-t border-white/5">Fonte: {monetizacaoMesAtual?.fonte || monetizacaoAcumulado?.fonte || 'YouTube + Facebook'} · mês e acumulado nunca são somados entre si.</p>
                </>
              )}
            </div>
          )}

        </div>
      )}

      {!metricas && !loading && (
        <div className="mt-6 bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-center justify-between gap-3">
          <p className="text-amber-300 text-sm font-bold">Nenhum dado manual cadastrado pra {MESES_LABEL[mes - 1]}/{ano} ainda.</p>
          {(perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente') && (
            <Link href="/midia/configuracoes" className="bg-amber-500 hover:bg-amber-400 text-[#0B1120] px-3 py-1.5 rounded-lg text-[12px] font-black uppercase tracking-widest whitespace-nowrap">Cadastrar</Link>
          )}
        </div>
      )}
    </div>
  );
}
