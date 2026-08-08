import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnidades } from '@/lib/useUnidades';

// Bootstrap comum das 3 páginas do Pulse (Painel/Nova Venda/Estoque) — cada uma é uma
// rota própria no menu (não abas dentro da mesma tela), mas todas precisam do mesmo
// gate de módulo + dados de apoio (unidades, vendedores).
export function usePulseAccess() {
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

  return { authLoading, user, perfil, empresa, unidades, isLideranca, usersMap, temPulse };
}
