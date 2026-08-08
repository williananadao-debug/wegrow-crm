"use client";
import { useState, useEffect } from 'react';
import { Loader2, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnidades } from '@/lib/useUnidades';
import Pulse from './Pulse';

export default function PulsePage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const { unidades } = useUnidades(perfil?.empresa_id);

  const isDirector = perfil?.cargo === 'diretor';
  const isGerente = perfil?.cargo === 'gerente';
  const isLideranca = isDirector || isGerente;
  const temPulse = Boolean(empresa?.modulos?.pulse);

  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!perfil?.empresa_id || !isLideranca) return;
    supabase.from('profiles').select('id, nome').eq('empresa_id', perfil.empresa_id).order('nome', { ascending: true })
      .then(({ data }) => {
        if (data) setUsersMap(data.reduce((acc: any, p: any) => ({ ...acc, [p.id]: p.nome }), {}));
      });
  }, [perfil?.empresa_id, isLideranca]);

  if (authLoading) {
    return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  }

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return <Pulse perfil={perfil} user={user} unidades={unidades} isLideranca={isLideranca} usersMap={usersMap} />;
}
