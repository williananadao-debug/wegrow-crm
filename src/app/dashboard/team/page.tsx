"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Tipagem rigorosa para evitar erro de Build
interface Perfil { 
  id: string; 
  nome: string; 
  cargo: 'diretor' | 'gerente' | 'vendedor'; 
  email: string;
}

interface AuthContextType {
  user: any;
  perfil: Perfil | null;
  signOut: () => Promise<void>;
  loading: boolean;
}

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

  // Função de busca que NUNCA retorna um perfil genérico
  const fetchSecureProfile = useCallback(async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // TRAVA DE SEGURANÇA MÁXIMA PARA O ADMIN
      if (email === 'admin@wegrow.com') {
        return {
          id: userId,
          email: email,
          nome: data?.nome || 'Administrador WeGrow',
          cargo: 'diretor' as const
        };
      }

      // Se não houver dados para um usuário comum, ele NÃO PODE ENTRAR
      if (!data) return null;

      return data as Perfil;
    } catch (err) {
      console.error('Erro crítico de identidade:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const syncAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const validatedProfile = await fetchSecureProfile(session.user.id, session.user.email!);
        
        if (isMounted) {
          if (validatedProfile) {
            setUser(session.user);
            setPerfil(validatedProfile);
          } else {
            // Se falhar a validação, força o logout para evitar o bug do "Visitante"
            await supabase.auth.signOut();
            setUser(null);
            setPerfil(null);
            router.replace('/login');
          }
        }
      } else if (pathname !== '/login' && !pathname.startsWith('/auth')) {
        router.replace('/login');
      }
      
      if (isMounted) setLoading(false);
    };

    syncAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          const p = await fetchSecureProfile(session.user.id, session.user.email!);
          if (p) {
            setPerfil(p);
            setUser(session.user);
          }
        }
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setPerfil(null);
        if (pathname !== '/login') router.replace('/login');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, fetchSecureProfile]);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
    setLoading(false);
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B1120]">
        <Loader2 className="animate-spin text-[#22C55E] mb-4" size={48} />
        <div className="text-center">
            <h2 className="text-white font-black uppercase tracking-widest text-sm">Sincronizando Identidade</h2>
            <p className="text-slate-500 text-[10px] mt-1 italic">Bloqueando acesso não autorizado...</p>
        </div>
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