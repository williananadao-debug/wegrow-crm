"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setUser(session.user);
        
        // Busca o perfil que agora GARANTIMOS que existe via Trigger no SQL
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        // LOG DE SEGURANÇA (Opcional, bom para você ver a mágica SaaS acontecendo)
        if (profile) console.log('🏢 Empresa Conectada:', profile.empresa_id);

        setPerfil(profile);
      } else {
        // 👇 A LISTA VIP DO LEÃO DE CHÁCARA
        const isPublicPage = window.location.pathname === '/login' || window.location.pathname === '/solicitar' || window.location.pathname === '/portal';
        
        if (!isPublicPage) {
          router.replace('/login');
        }
      }
      setLoading(false);
    };

    checkSession();

    // Ouve mudanças na sessão (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        checkSession();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, perfil, loading, signOut: () => supabase.auth.signOut() }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);