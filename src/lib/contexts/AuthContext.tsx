"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [empresa, setEmpresa] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setUser(session.user);

        const { data: profile } = await supabase
          .from('profiles')
          .select('*, empresa:empresa_id(modulos, plano, status)')
          .eq('id', session.user.id)
          .single();

        const { empresa: empData, ...perfil } = profile || {};

        setPerfil(perfil);
        setEmpresa(empData ?? null);
      } else {
        const path = window.location.pathname;
        const isPublicPage = ['/', '/login', '/solicitar', '/portal', '/reset-password'].includes(path)
          || path.startsWith('/portal-cdl')
          || path.startsWith('/proposta-cdl')
          || path.startsWith('/carteirinha');
        if (!isPublicPage) router.replace('/login');
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
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
