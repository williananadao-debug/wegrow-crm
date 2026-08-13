"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Bell, Cake, Megaphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';
import { MidiaAniversarioMunicipio, diasAteProximaOcorrencia } from '../shared';

const DIAS_ALERTA_ANIVERSARIO = 5;

export default function MidiaAniversariosPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const [aniversarios, setAniversarios] = useState<MidiaAniversarioMunicipio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id || !temMidia) return;
    setLoading(true);
    supabase.from('midia_aniversarios_municipios').select('*').eq('empresa_id', perfil.empresa_id).eq('ativo', true)
      .then(({ data }) => { setAniversarios((data as MidiaAniversarioMunicipio[]) || []); setLoading(false); });
  }, [perfil?.empresa_id, temMidia]);

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

  const ordenados = aniversarios
    .map(a => ({ ...a, diasRestantes: diasAteProximaOcorrencia(a.dia, a.mes) }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
  const urgentes = ordenados.filter(a => a.diasRestantes <= DIAS_ALERTA_ANIVERSARIO);
  const demais = ordenados.filter(a => a.diasRestantes > DIAS_ALERTA_ANIVERSARIO);

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <MidiaTabs />

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : ordenados.length === 0 ? (
        <div className="bg-[#0B1120] border border-white/10 rounded-3xl p-10 text-center">
          <Cake size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm mb-3">Nenhuma cidade cadastrada ainda.</p>
          {isLideranca && <Link href="/midia/configuracoes" className="inline-block bg-pink-500 hover:bg-pink-400 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest">Cadastrar em Configurações</Link>}
        </div>
      ) : (
        <>
          {urgentes.length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap mb-6">
              <Bell size={16} className="text-emerald-400 shrink-0 animate-pulse" />
              <p className="text-emerald-300 text-xs font-black uppercase tracking-wide flex-1">
                {urgentes.length} aniversário{urgentes.length > 1 ? 's' : ''} de município nos próximos {DIAS_ALERTA_ANIVERSARIO} dias:
                <span className="text-white ml-2">
                  {urgentes.map(a => `${a.municipio} (${a.diasRestantes === 0 ? 'hoje' : `${a.diasRestantes}d`})`).join(' · ')}
                </span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {ordenados.map(a => (
              <div key={a.id} className={`rounded-2xl p-4 border ${a.diasRestantes <= DIAS_ALERTA_ANIVERSARIO ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[#0B1120] border-white/10'}`}>
                <p className="text-sm font-bold text-white truncate">{a.municipio}</p>
                {a.uf && <p className="text-[9px] text-slate-500 font-bold uppercase">{a.uf}{a.praca ? ` · ${a.praca}` : ''}</p>}
                <p className="text-lg font-black text-white mt-1">{String(a.dia).padStart(2, '0')}/{String(a.mes).padStart(2, '0')}</p>
                <p className={`text-[10px] font-black uppercase mt-0.5 ${a.diasRestantes <= DIAS_ALERTA_ANIVERSARIO ? 'text-emerald-400' : 'text-slate-500'}`}>{a.diasRestantes === 0 ? 'Hoje' : `Faltam ${a.diasRestantes} dias`}</p>
                {a.observacao && <p className="text-[9px] text-amber-400/80 mt-1.5">{a.observacao}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
