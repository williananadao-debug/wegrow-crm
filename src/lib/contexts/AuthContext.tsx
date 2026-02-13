"use client";
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type Perfil = { 
  id: string; 
  nome: string; 
  cargo: 'diretor' | 'gerente' | 'vendedor'; 
  filial_id: number 
};

const AuthContext = createContext<{ 
  user: any; 
  perfil: Perfil | null; 
  signOut: () => void 
}>({ 
  user: null, 
  perfil: null, 
  signOut: () => {} 
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true); // Começa carregando
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const verificarSessao = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        // Busca o perfil no banco
        const { data } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', session.user.id)
          .single();
        if (data) setPerfil(data);
      } else if (pathname !== '/login') {
        // Se não tem usuário e não está na tela de login, manda pro login
        router.push('/login');
      }
      setLoading(false);
    };

    verificarSessao();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setPerfil(null);
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // TELA DE CARREGAMENTO (Bloqueia o site enquanto verifica)
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0B1120] text-white gap-2">
        <Loader2 className="animate-spin text-[#22C55E]" size={32} />
        <span className="font-bold uppercase tracking-widest text-xs">Verificando Acesso...</span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, perfil, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);