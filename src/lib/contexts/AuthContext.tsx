"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { isPublicPage, cargoPodeAcessar, rotaInicialCargo } from '@/lib/publicPages';

const AuthContext = createContext<any>(null);

function hexParaRgbChannels(hex: string): string {
  const limpo = hex.replace('#', '');
  const valido = /^[0-9a-fA-F]{6}$/.test(limpo) ? limpo : '22c55e';
  const r = parseInt(valido.slice(0, 2), 16);
  const g = parseInt(valido.slice(2, 4), 16);
  const b = parseInt(valido.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

// Cache local do perfil (por usuário) — ver checkSession. Storage pode falhar (aba anônima,
// bloqueio do navegador): aí só não usa cache.
const CHAVE_CACHE_PERFIL = 'wg_perfil_cache';
type CachePerfil = { userId: string; perfil: any; empresa: any };

function lerCachePerfil(userId: string): CachePerfil | null {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE_PERFIL);
    if (!bruto) return null;
    const cache = JSON.parse(bruto) as CachePerfil;
    return cache?.userId === userId && cache.perfil ? cache : null;
  } catch { return null; }
}

function gravarCachePerfil(userId: string, perfil: any, empresa: any) {
  try { localStorage.setItem(CHAVE_CACHE_PERFIL, JSON.stringify({ userId, perfil, empresa })); } catch { /* sem cache */ }
}

function limparCachePerfil() {
  try { localStorage.removeItem(CHAVE_CACHE_PERFIL); } catch { /* nada */ }
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

        // Perfil/empresa da última visita: libera a tela na hora, sem esperar a ida ao banco
        // (antes nenhuma página aparecia antes dessa consulta — 3s+ de esqueleto no Speed
        // Insights). Só serve pra desenhar a interface; os dados continuam protegidos por RLS,
        // e logo abaixo o perfil é buscado de novo e substitui o do cache.
        const cache = lerCachePerfil(session.user.id);
        if (cache) {
          setPerfil(cache.perfil);
          setEmpresa(cache.empresa);
          setLoading(false);
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*, empresa:empresa_id(nome, modulos, plano, status, logo_url, cor_primaria)')
          .eq('id', session.user.id)
          .single();

        // Falha de rede com cache na mão: fica com o cache em vez de zerar o perfil.
        if (error && cache) return;

        const { empresa: empData, ...perfil } = profile || {};

        // Desativado com sessão ainda aberta (o ban só barra a renovação do token): sai na hora.
        if (perfil?.desativado_em) {
          limparCachePerfil();
          await supabase.auth.signOut();
          router.replace('/login');
          setLoading(false);
          return;
        }

        setPerfil(perfil);
        setEmpresa(empData ?? null);
        if (profile) gravarCachePerfil(session.user.id, perfil, empData ?? null);
      } else {
        limparCachePerfil();
        if (!isPublicPage(window.location.pathname)) router.replace('/login');
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

  // Cargos restritos (almoxarifado, producao — ver publicPages.ts) só veem as telas deles — o menu (navbar.tsx) já
  // esconde o resto visualmente, isso aqui é o bloqueio de verdade: roda a cada troca
  // de rota (não só no login), então entrar direto pela URL numa página fora da
  // lista também é barrado, não só clicar num link escondido.
  useEffect(() => {
    if (loading || !perfil || isPublicPage(pathname)) return;
    if (!cargoPodeAcessar(perfil.cargo, pathname)) {
      router.replace(rotaInicialCargo(perfil.cargo));
    }
  }, [pathname, perfil, loading, router]);

  return (
    <AuthContext.Provider value={{ user, perfil, empresa, loading, signOut: () => { limparCachePerfil(); return supabase.auth.signOut(); } }}>
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
          {/* Texto real: esqueleto só de caixas não conta como "primeiro conteúdo" pro navegador. */}
          <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Carregando…</p>
          <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-32 rounded-2xl bg-white/5 animate-pulse" />
          <div className="h-64 rounded-2xl bg-white/5 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
