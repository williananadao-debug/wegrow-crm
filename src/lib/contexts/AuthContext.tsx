"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const AuthContext = createContext<any>({ user: null, perfil: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function getSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        // Se for o admin, garante os poderes independente do banco
        const isMaster = session.user.email === 'admin@wegrow.com';
        
        setUser(session.user);
        setPerfil(isMaster ? { ...profile, cargo: 'diretor', nome: 'Admin' } : profile);
      } else {
        router.replace('/login');
      }
      setLoading(false);
    }
    getSession();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, perfil, loading, signOut: () => supabase.auth.signOut() }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);