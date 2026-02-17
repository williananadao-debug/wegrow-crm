"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// --- TIPAGEM (Baseada na tabela 'profiles') ---
type Perfil = { 
  id: string; 
  nome: string; 
  cargo: 'diretor' | 'gerente' | 'vendedor'; 
  email: string;
  unidade_id?: string;
  avatar_url?: string;
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

  // --- FUNÇÃO DE BUSCA DO PERFIL ---
  const buscarPerfil = async (userId: string, userEmail?: string) => {
    try {
      // 1. Busca na tabela correta 'profiles'
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); // Usa maybeSingle para não quebrar se não achar

      if (error) {
        console.error('Erro ao buscar perfil:', error.message);
      }

      // --- TRAVA DE SEGURANÇA (ADMIN SUPREMO) ---
      // Se o banco falhar ou o cargo estiver errado, isso garante seu acesso.
      const emailParaVerificar = userEmail || data?.email;
      if (emailParaVerificar === 'admin@wegrow.com') {
          // Retorna um perfil de Diretor forçado
          return { 
            ...data, 
            id: userId,
            email: 'admin@wegrow.com',
            cargo: 'diretor',
            nome: data?.nome || 'Admin WeGrow'
          } as Perfil;
      }
      // ------------------------------------------

      return data as Perfil;
    } catch (err) {
      console.error('Erro crítico:', err);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    // --- TIMEOUT ANTI-TRAVAMENTO ---
    // Se o banco não responder em 4 segundos, libera o app para não ficar na tela de load eterno
    const safetyTimer = setTimeout(() => {
        if (isMounted && loading) {
            console.warn("⚠️ Login demorou. Liberando interface por segurança.");
            setLoading(false); 
        }
    }, 4000);

    const inicializarSessao = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          if (isMounted) setUser(session.user);
          
          // Busca perfil usando ID e Email
          const dadosPerfil = await buscarPerfil(session.user.id, session.user.email);
          
          if (isMounted) setPerfil(dadosPerfil);
        } else {
          // Se não tem usuário e não está no login
          if (pathname !== '/login') {
            router.replace('/login');
          }
        }
      } catch (error) {
        console.error("Erro auth:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    inicializarSessao();

    // Listener de mudanças (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        const dadosPerfil = await buscarPerfil(session.user.id, session.user.email);
        setPerfil(dadosPerfil);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setPerfil(null);
        setLoading(false);
        router.replace('/login');
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
    router.push('/login');
    setLoading(false);
  };

  // --- TELA DE CARREGAMENTO ---
  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B1120] text-white gap-4">
        <Loader2 className="animate-spin text-[#22C55E]" size={48} />
        <div className="flex flex-col items-center gap-1">
           <span className="font-black uppercase tracking-widest text-sm">Carregando Sistema</span>
           <span className="text-[10px] text-slate-500 font-mono">Verificando acesso...</span>
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