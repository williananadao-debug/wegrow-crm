"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type Perfil = { 
  id: string; 
  nome: string; 
  cargo: 'diretor' | 'gerente' | 'vendedor'; 
  email: string;
};

type AuthContextType = {
  user: any;
  perfil: Perfil | null;
  signOut: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  perfil: null, 
  signOut: async () => {},
  loading: true
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  
  const router = useRouter();
  const pathname = usePathname();

  // Função de busca com validação rigorosa
  const fetchPerfilETravar = useCallback(async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // REGRA SUPREMA: Se for o email do dono, ele É diretor, ponto final.
      if (email === 'admin@wegrow.com') {
        return {
          id: userId,
          email: email,
          nome: data?.nome || 'Administrador',
          cargo: 'diretor'
        } as Perfil;
      }

      // Se não achou dados no banco para um usuário comum, retorna null para forçar logout
      if (!data) return null;

      return data as Perfil;
    } catch (err) {
      console.error('Erro ao buscar perfil:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const sessionInit = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const p = await fetchPerfilETravar(session.user.id, session.user.email!);
        if (active) {
          if (p) {
            setUser(session.user);
            setPerfil(p);
          } else {
            // Se tem sessão mas não tem perfil, limpa tudo (Evita o "Visitante")
            await supabase.auth.signOut();
            router.replace('/login');
          }
        }
      } else if (pathname !== '/login') {
        router.replace('/login');
      }
      if (active) setLoading(false);
    };

    sessionInit();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          const p = await fetchPerfilETravar(session.user.id, session.user.email!);
          setPerfil(p);
          setUser(session.user);
        }
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setPerfil(null);
        if (pathname !== '/login') router.replace('/login');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, fetchPerfilETravar]);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B1120]">
        <Loader2 className="animate-spin text-[#22C55E] mb-4" size={48} />
        <span className="text-white font-black uppercase tracking-widest text-xs">Sincronizando Identidade...</span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, perfil, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);