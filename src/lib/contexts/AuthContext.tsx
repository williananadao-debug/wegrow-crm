"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { isPublicPage } from '@/lib/publicPages';

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [empresa, setEmpresa] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const publicPage = isPublicPage(pathname);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setUser(session.user);

        const { data: profile } = await supabase
          .from('profiles')
          .select('*, empresa:empresa_id(nome, modulos, plano, status)')
          .eq('id', session.user.id)
          .single();

        const { empresa: empData, ...perfil } = profile || {};

        setPerfil(perfil);
        setEmpresa(empData ?? null);
      } else if (!isPublicPage(window.location.pathname)) {
        router.replace('/login');
      }
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') checkSession();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, perfil, empresa, loading, signOut: () => supabase.auth.signOut() }}>
      {(!loading || publicPage) ? children : <AuthLoadingShell />}
    </AuthContext.Provider>
  );
}

// Esqueleto estático (sem dependência de rede) para o primeiro paint acontecer
// imediatamente, em vez de deixar a tela em branco até sessão+perfil resolverem.
function AuthLoadingShell() {
  return (
    <div className="flex h-screen bg-[#0B1120] overflow-hidden">
      <div className="hidden md:block w-[88px] h-full bg-[#0B1120] border-r border-white/5 flex-shrink-0" />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="hidden md:block h-20 border-b border-white/5 flex-shrink-0" />
        <div className="flex-1 p-4 md:p-8 space-y-4">
          <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-32 rounded-2xl bg-white/5 animate-pulse" />
          <div className="h-64 rounded-2xl bg-white/5 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
