"use client";
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Radio, Megaphone, Instagram, Facebook, RefreshCw, AlertTriangle, BarChart3, Clock, Users2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';
import { DemaisFmAudienciaResposta, DemaisFmRedesSociaisResposta, PRACAS, PRACA_CIDADE_SEDE, fmtNumero, fmtCompacto } from '../shared';

export default function MidiaEmissorasPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);

  const [praca, setPraca] = useState<string>(PRACAS[0]);
  const [audiencia, setAudiencia] = useState<DemaisFmAudienciaResposta | null>(null);
  const [redesSociais, setRedesSociais] = useState<DemaisFmRedesSociaisResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const [resAud, resRedes] = await Promise.all([
        fetch('/api/midia/demais-fm/audiencia', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/midia/demais-fm/redes-sociais', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      const jsonAud = await resAud.json();
      if (!resAud.ok) throw new Error(jsonAud.erro || 'Erro ao buscar audiência.');
      setAudiencia(jsonAud);
      setRedesSociais(resRedes.ok ? await resRedes.json() : null);
    } catch (err: any) {
      setAudiencia(null);
      setErro(err?.message || 'Erro ao buscar audiência.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (temMidia) carregar(); }, [temMidia, carregar]);

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temMidia) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Demais FM Comercial não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  const d = audiencia?.dados.find(x => x.emissora === praca);

  // Escopo "emissora" só (ver spec 2.3) — o perfil de nível rede (Instagram Demais News)
  // fica de fora de propósito, essa tela é por praça.
  const daPracaRedes = (redesSociais?.dados || []).filter(x => x.emissora === praca && x.escopo === 'emissora');
  const periodosRedes = Array.from(new Set(daPracaRedes.map(x => x.periodo))).sort();
  const periodoRedesRecente = periodosRedes[periodosRedes.length - 1];
  const instagramPraca = daPracaRedes.find(x => x.periodo === periodoRedesRecente && x.plataforma === 'Instagram');
  const facebookPraca = daPracaRedes.find(x => x.periodo === periodoRedesRecente && x.plataforma === 'Facebook');

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <MidiaTabs />

      <div className="flex items-center gap-1 bg-[#0F172A] border border-white/10 p-1 rounded-xl mb-6 w-fit flex-wrap">
        {PRACAS.map(p => (
          <button key={p} onClick={() => setPraca(p)} className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${praca === p ? 'bg-[#22C55E] text-[#0B1120]' : 'text-slate-500 hover:text-white'}`}>
            {p} {PRACA_CIDADE_SEDE[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : erro ? (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <p className="text-amber-200 text-xs font-semibold">{erro}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* Header da emissora */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Demais FM {praca}</p>
              <h2 className="text-xl font-black text-[#22C55E]">{PRACA_CIDADE_SEDE[praca]}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22C55E]"></span>
              </span>
              <button onClick={carregar} disabled={loading} className="text-slate-500 hover:text-white transition-colors">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Audiência */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Audiência</p>
              <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Estimado</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Ouvintes por minuto</p>
                <h3 className="text-2xl font-black text-amber-400">{fmtNumero(d?.ouvintes_por_minuto)}</h3>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Share de audiência</p>
                <h3 className="text-2xl font-black text-white">{d?.pct_audiencia != null ? `${d.pct_audiencia}%` : '—'}</h3>
              </div>
            </div>
            {d && <p className="text-[9px] text-slate-600 font-bold mt-3 pt-3 border-t border-white/5">Fonte: {d.fonte} · atualizado em {audiencia?.atualizado_em ? new Date(audiencia.atualizado_em).toLocaleDateString('pt-BR') : '—'}</p>}
          </div>

          {/* Redes sociais por praça */}
          <div className={`bg-[#0B1120] border border-white/10 rounded-2xl p-5 ${!periodoRedesRecente ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Instagram size={13} /> Redes sociais{periodoRedesRecente ? ` — ${periodoRedesRecente}` : ''}</p>
              {periodoRedesRecente ? (
                <span className="text-[9px] font-black uppercase text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">Ao vivo</span>
              ) : (
                <span className="text-[9px] font-black uppercase text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Sem dado</span>
              )}
            </div>
            {!periodoRedesRecente ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-dashed border-white/10 rounded-xl p-4 flex items-center gap-2 text-slate-600">
                  <Instagram size={14} /><p className="text-[11px] font-bold">Instagram por praça — aguardando primeira ingestão do Leo.</p>
                </div>
                <div className="border border-dashed border-white/10 rounded-xl p-4 flex items-center gap-2 text-slate-600">
                  <Facebook size={14} /><p className="text-[11px] font-bold">Facebook — aguardando primeira ingestão do Leo.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-white/5 bg-white/[0.02] rounded-xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-2"><Instagram size={12}/> Instagram</p>
                  <h4 className="text-lg font-black text-white">{fmtCompacto(instagramPraca?.visualizacoes)}</h4>
                  <p className="text-[9px] text-slate-500 font-bold">visualizações</p>
                  <div className="flex gap-3 mt-2 text-[10px] text-slate-400 font-bold">
                    <span>{fmtCompacto(instagramPraca?.interacoes)} interações</span>
                    <span>{fmtCompacto(instagramPraca?.seguidores)} seguidores</span>
                  </div>
                </div>
                <div className="border border-white/5 bg-white/[0.02] rounded-xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-2"><Facebook size={12}/> Facebook</p>
                  <h4 className="text-lg font-black text-white">{fmtCompacto(facebookPraca?.visualizacoes)}</h4>
                  <p className="text-[9px] text-slate-500 font-bold">visualizações</p>
                  <div className="flex gap-3 mt-2 text-[10px] text-slate-400 font-bold">
                    <span>{fmtCompacto(facebookPraca?.interacoes)} interações</span>
                    <span>{fmtCompacto(facebookPraca?.seguidores)} seguidores</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Formato que mais gera resultado — sem dado ainda */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><BarChart3 size={13} /> Formato que mais gera resultado</p>
              <span className="text-[9px] font-black uppercase text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Sem dado</span>
            </div>
            <p className="text-[11px] text-slate-600 font-bold">Vem de pesquisa de percepção do ouvinte (Google Forms) — nenhum formulário rodado ainda por esta conta.</p>
          </div>

          {/* Horários mais ouvidos — sem dado ainda */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Clock size={13} /> Horários mais ouvidos</p>
              <span className="text-[9px] font-black uppercase text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Sem dado</span>
            </div>
            <p className="text-[11px] text-slate-600 font-bold">Vem de formulário de pesquisa de audiência — sem coleta rodada ainda.</p>
          </div>

          {/* Perfil dos cadastrados — sem dado ainda */}
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Users2 size={13} /> Perfil dos cadastrados na promoção</p>
              <span className="text-[9px] font-black uppercase text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Sem dado</span>
            </div>
            <p className="text-[11px] text-slate-600 font-bold">Vem do cadastro do app/promoção da rede — nenhuma promoção com formulário rodando ainda.</p>
          </div>

        </div>
      )}
    </div>
  );
}
