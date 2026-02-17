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
    async function checkUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // Busca o perfil, mas não trava se não achar
          const { data: dbProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          // BLINDAGEM: Se o email for o seu, força DIRETOR aqui no código
          if (session.user.email === 'admin@wegrow.com') {
            const adminForcado = {
              id: session.user.id,
              nome: dbProfile?.nome || 'Admin Principal',
              cargo: 'diretor',
              email: session.user.email
            };
            setUser(session.user);
            setPerfil(adminForcado);
          } else if (dbProfile) {
            setUser(session.user);
            setPerfil(dbProfile);
          } else {
            // Se não for admin e não tiver perfil, desloga por segurança
            await supabase.auth.signOut();
            router.replace('/login');
          }
        } else {
          router.replace('/login');
        }
      } catch (e) {
        console.error("Erro Crítico Auth:", e);
      } finally {
        setLoading(false);
      }
    }
    checkUser();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, perfil, loading, signOut: () => supabase.auth.signOut() }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);