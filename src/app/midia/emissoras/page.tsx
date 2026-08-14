"use client";
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Radio, Megaphone, Instagram, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';
import { DemaisFmAudienciaResposta, PRACAS, PRACA_CIDADE_SEDE, fmtNumero } from '../shared';

export default function MidiaEmissorasPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);

  const [audiencia, setAudiencia] = useState<DemaisFmAudienciaResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/midia/demais-fm/audiencia', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar audiência.');
      setAudiencia(json);
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

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <MidiaTabs />

      <div className="flex justify-end items-center gap-3 mb-6">
        {audiencia?.atualizado_em && <p className="text-[10px] text-slate-500 font-bold">Atualizado em {new Date(audiencia.atualizado_em).toLocaleDateString('pt-BR')}</p>}
        <button onClick={carregar} disabled={loading} className="text-slate-500 hover:text-white transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : erro ? (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <p className="text-amber-200 text-xs font-semibold">{erro}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRACAS.map(praca => {
            const d = audiencia?.dados.find(x => x.emissora === praca);
            return (
              <div key={praca} className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-black text-white">{praca} FM</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{PRACA_CIDADE_SEDE[praca]}</p>
                  </div>
                  <Radio size={20} className="text-pink-500 opacity-50" />
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Audiência</p>
                      <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Estimado</span>
                    </div>
                    <h4 className="text-xl font-black text-white mt-1">{fmtNumero(d?.ouvintes_por_minuto)}</h4>
                    <p className="text-[9px] text-slate-500 font-bold">ouvintes por minuto{d?.pct_audiencia != null ? ` · ${d.pct_audiencia}% share` : ''}</p>
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Instagram size={11} /> Redes sociais por praça</p>
                    <p className="text-[10px] text-slate-600 font-bold mt-1">Em construção — hoje o Instagram ao vivo é medido só agregado (Visão Geral). Separar por praça exige uma conta Meta por emissora.</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
