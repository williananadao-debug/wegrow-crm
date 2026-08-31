"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { isPublicPage } from '@/lib/publicPages';

const AuthContext = createContext<any>(null);

function hexParaRgbChannels(hex: string): string {
  const limpo = hex.replace('#', '');
  const valido = /^[0-9a-fA-F]{6}$/.test(limpo) ? limpo : '22c55e';
  const r = parseInt(valido.slice(0, 2), 16);
  const g = parseInt(valido.slice(2, 4), 16);
  const b = parseInt(valido.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

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
          .select('*, empresa:empresa_id(nome, modulos, plano, status, logo_url, cor_primaria)')
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

  // Cor de marca por tenant, aplicada globalmente via CSS custom property — qualquer
  // classe Tailwind escrita como `bg-[var(--cor-primaria)]`/`text-[var(--cor-primaria)]`
  // passa a herdar a cor da empresa automaticamente. Fallback pro verde padrão do produto
  // quando a empresa não tiver definido a própria (ou antes do perfil carregar).
  // Uma segunda variável (canais R G B separados por espaço) existe só pra viabilizar
  // opacidade — `bg-[#hex]/10` do Tailwind não sabe aplicar opacidade em cima de uma cor
  // vinda de var(), mas `rgb(var(--x-rgb)/10%)` é CSS puro e funciona em qualquer versão.
  useEffect(() => {
    const hex = empresa?.cor_primaria || '#22C55E';
    document.documentElement.style.setProperty('--cor-primaria', hex);
    document.documentElement.style.setProperty('--cor-primaria-rgb', hexParaRgbChannels(hex));
  }, [empresa?.cor_primaria]);

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
