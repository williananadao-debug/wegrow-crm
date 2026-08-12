import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnidades } from '@/lib/useUnidades';

// Bootstrap comum das telas de Obras — mesmo padrão de usePulseAccess.ts.
export function useObrasAccess() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const { unidades } = useUnidades(perfil?.empresa_id);

  const isDirector = perfil?.cargo === 'diretor';
  const isGerente = perfil?.cargo === 'gerente';
  const isLideranca = isDirector || isGerente;
  const temObras = Boolean(empresa?.modulos?.obras);

  return { authLoading, user, perfil, empresa, unidades, isLideranca, temObras };
}
