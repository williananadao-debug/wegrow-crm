"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Tipagem atualizada conforme o banco de dados 'profiles'
type Perfil = { 
  id: string; 
  nome: string; 
  cargo: 'diretor' | 'gerente' | 'vendedor'; 
  email: string;
  unidade_id?: string;
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

  // Função auxiliar para buscar o perfil na tabela CERTA
  const buscarPerfil = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles') // <--- CORREÇÃO: Usar 'profiles', não 'perfis'
        .select('*')
        .eq('id', userId) // <--- OBRIGATÓRIO: Filtra pelo ID do usuário logado
        .single();

      if (error) {
        console.error('Erro ao buscar perfil:', error.message);
        return null;
      }
      
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
          
          // 2. Busca os dados do perfil (cargo, nome, etc)
          const dadosPerfil = await buscarPerfil(session.user.id);
          
          if (mounted) {
            setPerfil(dadosPerfil);
          }
        } else {
          // Se não tem usuário e tenta acessar página protegida
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

    // 3. Ouvinte de mudanças (Login, Logout, Token Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        // Garante que o perfil seja carregado também na troca de estado
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
           <span className="text-[10px] text-slate-500 font-mono">Autenticando usuário...</span>
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