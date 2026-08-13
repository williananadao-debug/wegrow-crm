"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Megaphone, Loader2, RefreshCw, Instagram, Youtube, Smartphone, DollarSign, Radio, Newspaper, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from './MidiaTabs';
import { MidiaMetricasMensais, InstagramInsightsResposta, MESES_LABEL, fmtCompacto, fmtMoeda, fmtNumero } from './shared';

export default function MidiaPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);

  const [metricas, setMetricas] = useState<MidiaMetricasMensais | null>(null);
  const [historico, setHistorico] = useState<MidiaMetricasMensais[]>([]);
  const [instagram, setInstagram] = useState<InstagramInsightsResposta | null>(null);
  const [erroInstagram, setErroInstagram] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [carregandoInstagram, setCarregandoInstagram] = useState(false);

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

  const carregarInstagram = useCallback(async () => {
    setCarregandoInstagram(true);
    setErroInstagram(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch(`/api/midia/instagram?ano=${ano}&mes=${mes}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar Instagram.');
      setInstagram(json);
    } catch (err: any) {
      setInstagram(null);
      setErroInstagram(err?.message || 'Erro ao buscar Instagram.');
    } finally {
      setCarregandoInstagram(false);
    }
  }, [ano, mes]);

  useEffect(() => { if (temMidia) { carregarManual(); carregarInstagram(); } }, [temMidia, carregarManual, carregarInstagram]);

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temMidia) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Mídia não está ativo pra sua empresa ainda.</p>
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

      <div className="flex justify-end mb-6">
        <div className="flex items-center gap-2">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold uppercase text-white outline-none focus:border-pink-500">
            {MESES_LABEL.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
          </select>
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold uppercase text-white outline-none focus:border-pink-500">
            {[hoje.getFullYear(), hoje.getFullYear() - 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Radio size={12} /> Rede em cadeia</p>
              <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Estimado</span>
            </div>
            <h3 className="text-2xl font-black text-white">{fmtNumero(metricas?.ouvintes_por_minuto_estimado)}</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">ouvintes por minuto</p>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Instagram size={12} /> Instagram (ao vivo)</p>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded">Medido</span>
                <button onClick={carregarInstagram} disabled={carregandoInstagram} className="text-slate-500 hover:text-white transition-colors">
                  <RefreshCw size={12} className={carregandoInstagram ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            {erroInstagram ? (
              <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1.5"><AlertTriangle size={12} /> {erroInstagram}</p>
            ) : instagram ? (
              <div className="grid grid-cols-3 gap-4">
                <div><h3 className="text-xl font-black text-white">{fmtCompacto(instagram.visualizacoes)}</h3><p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Visualizações</p></div>
                <div><h3 className="text-xl font-black text-white">{fmtCompacto(instagram.interacoes)}</h3><p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Interações</p></div>
                <div><h3 className="text-xl font-black text-white">{fmtCompacto(instagram.visitasPerfil)}</h3><p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Visitas ao Perfil</p></div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 font-bold">Sem dados.</p>
            )}
            {instagram && <p className="text-[9px] text-slate-600 font-bold mt-2">{fmtNumero(instagram.seguidores)} seguidores hoje. Facebook ainda não integrado — some com o manual em Configurações se quiser somar.</p>}
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Newspaper size={12} /> Demais News</p>
              <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Manual</span>
            </div>
            <h3 className="text-2xl font-black text-white">{fmtNumero(metricas?.site_acessos)}</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">acessos no site</p>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Instagram size={12} /> Instagram Demais News</p>
              <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Manual</span>
            </div>
            <h3 className="text-2xl font-black text-white">{fmtCompacto(metricas?.instagram_demais_news_visualizacoes)}</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">
              {fmtNumero(metricas?.instagram_demais_news_interacoes)} interações · {fmtNumero(metricas?.instagram_demais_news_seguidores)} seguidores
            </p>
            <p className="text-[9px] text-slate-600 font-bold mt-2">Propriedade distinta das três emissoras — não entra na soma do card de Instagram acima.</p>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Youtube size={12} /> YouTube da Rede</p>
              <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Manual</span>
            </div>
            <h3 className="text-2xl font-black text-white">{fmtCompacto(metricas?.youtube_visualizacoes)}</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">visualizações no mês</p>
            {metricas?.youtube_observacoes && <p className="text-[9px] text-slate-500 mt-2 italic">{metricas.youtube_observacoes}</p>}
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 md:col-span-2">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Evolução — visualizações YouTube ({ano})</p>
            <div className="flex items-end gap-2 h-24">
              {graficoMeses.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="w-full rounded-t-lg bg-red-500/70 group-hover:bg-red-500 transition-all" style={{ height: `${Math.max((m.valor / maxGrafico) * 100, m.valor > 0 ? 3 : 0)}%` }} title={`${m.label}: ${fmtNumero(m.valor)}`} />
                  <span className="text-[8px] text-slate-600 font-bold uppercase">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Smartphone size={12} /> Downloads do App</p>
              <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Manual · Acumulado</span>
            </div>
            <h3 className="text-2xl font-black text-white">{fmtNumero((metricas?.app_downloads_apple_total || 0) + (metricas?.app_downloads_android_total || 0))}</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">
              Apple {fmtNumero(metricas?.app_downloads_apple_total)} · Android {fmtNumero(metricas?.app_downloads_android_total)}
            </p>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><DollarSign size={12} /> Monetização Digital</p>
              <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Manual</span>
            </div>
            <h3 className="text-2xl font-black text-[#22C55E]">{fmtMoeda(metricas?.monetizacao_valor)}</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">receita líquida do mês</p>
          </div>

        </div>
      )}

      {!metricas && !loading && (
        <div className="mt-6 bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-center justify-between gap-3">
          <p className="text-amber-300 text-xs font-bold">Nenhum dado manual cadastrado pra {MESES_LABEL[mes - 1]}/{ano} ainda.</p>
          {(perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente') && (
            <Link href="/midia/configuracoes" className="bg-amber-500 hover:bg-amber-400 text-[#0B1120] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Cadastrar</Link>
          )}
        </div>
      )}
    </div>
  );
}
