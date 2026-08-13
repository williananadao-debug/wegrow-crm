"use client";
import { useState, useEffect } from 'react';
import { Loader2, Radio, Megaphone, Instagram } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';
import { MidiaEmissoraAudiencia, PRACAS, PRACA_CIDADE_SEDE, MESES_LABEL, fmtNumero } from '../shared';

export default function MidiaEmissorasPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [dados, setDados] = useState<MidiaEmissoraAudiencia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id || !temMidia) return;
    setLoading(true);
    supabase.from('midia_emissoras_audiencia').select('*').eq('empresa_id', perfil.empresa_id).eq('ano', ano).eq('mes', mes)
      .then(({ data }) => { setDados((data as MidiaEmissoraAudiencia[]) || []); setLoading(false); });
  }, [perfil?.empresa_id, temMidia, ano, mes]);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRACAS.map(praca => {
            const d = dados.find(x => x.praca === praca);
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
                    <p className="text-[9px] text-slate-500 font-bold">ouvintes por minuto{d?.share_audiencia ? ` · ${d.share_audiencia}% share` : ''}</p>
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
