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
    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setUser(session.user);
        
        // Busca simples no banco
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        // BLINDAGEM SUPREMA: Se for você, ignora o erro do banco
        if (session.user.email === 'admin@wegrow.com') {
          setPerfil({
            id: session.user.id,
            nome: dbProfile?.nome || "Admin WeGrow",
            cargo: 'diretor',
            email: session.user.email
          });
        } else {
          setPerfil(dbProfile);
        }
      } else {
        router.replace('/login');
      }
      setLoading(false);
    }
    loadSession();
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, perfil, loading, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);