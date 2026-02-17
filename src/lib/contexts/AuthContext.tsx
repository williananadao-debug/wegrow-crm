"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Tipagem oficial do banco de dados
type Perfil = { 
  id: string; 
  nome: string; 
  cargo: 'diretor' | 'gerente' | 'vendedor'; 
  email: string;
  unidade_id?: string;
  avatar_url?: string;
};

// Definição do Contexto
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

  // --- FUNÇÃO DE BUSCA BLINDADA ---
  const buscarPerfil = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles') // Tabela correta
        .select('*')
        .eq('id', userId) // Filtra pelo ID do usuário logado
        .single();

      if (error) {
        console.error('Erro ao buscar perfil:', error.message);
        return null;
      }
      
      // --- TRAVA DE SEGURANÇA (A BLINDAGEM) ---
      // Se for o e-mail do dono, força o cargo 'diretor' via código.
      // Isso garante acesso total independente do que estiver no banco.
      if (data && data.email === 'admin@wegrow.com') {
          return { ...data, cargo: 'diretor' } as Perfil;
      }
      // ----------------------------------------
      
      return data as Perfil;
    } catch (err) {
      console.error('Erro crítico no perfil:', err);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const inicializarSessao = async () => {
      try {
        // 1. Verifica sessão atual no Supabase
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          
          // 2. Busca o perfil com a trava de segurança
          const dadosPerfil = await buscarPerfil(session.user.id);
          
          if (mounted) {
            setPerfil(dadosPerfil);
          }
        } else {
          // Se não tem usuário e tenta acessar página interna
          if (pathname !== '/login') {
            router.replace('/login');
          }
        }
      } catch (error) {
        console.error("Erro de autenticação:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    inicializarSessao();

    // 3. Monitora mudanças (Login, Logout, etc)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        // Recarrega o perfil para garantir que pegamos os dados atualizados
        const dadosPerfil = await buscarPerfil(session.user.id); 
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
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
    router.push('/login');
    setLoading(false);
  };

  // TELA DE CARREGAMENTO
  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B1120] text-white gap-4">
        <Loader2 className="animate-spin text-[#22C55E]" size={48} />
        <div className="flex flex-col items-center gap-1">
           <span className="font-black uppercase tracking-widest text-sm">Carregando Sistema</span>
           <span className="text-[10px] text-slate-500 font-mono">Verificando credenciais...</span>
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