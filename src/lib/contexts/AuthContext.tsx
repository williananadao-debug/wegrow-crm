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
    async function forceAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // BUSCA NO BANCO
          const { data: dbProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          // REGRA DE OURO: Se for você, ignora qualquer erro ou ausência no banco
          if (session.user.email === 'admin@wegrow.com') {
            const adminMaster = {
              id: session.user.id,
              nome: "Admin Principal",
              cargo: 'diretor', // Força o cargo de diretor aqui
              email: session.user.email
            };
            setUser(session.user);
            setPerfil(adminMaster);
          } else if (dbProfile) {
            setUser(session.user);
            setPerfil(dbProfile);
          } else {
            // Se não for admin e não tiver perfil, manda pro login
            await supabase.auth.signOut();
            router.replace('/login');
          }
        } else {
          router.replace('/login');
        }
      } catch (e) {
        console.error("Erro no Auth:", e);
      } finally {
        setLoading(false);
      }
    }
    forceAuth();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, perfil, loading, signOut: () => supabase.auth.signOut() }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);