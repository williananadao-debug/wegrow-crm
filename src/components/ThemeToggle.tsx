"use client";
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

// Tema do sistema: escuro é o padrão; o claro é escolha de cada pessoa (fica neste navegador).
// O script em layout.tsx aplica o tema antes de pintar a tela, pra não piscar escuro→claro.
export const CHAVE_TEMA = 'wg_tema';

export function lerTema(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [tema, setTema] = useState<'dark' | 'light'>('dark');
  useEffect(() => { void Promise.resolve().then(() => setTema(lerTema())); }, []);

  const trocar = () => {
    const novo = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem(CHAVE_TEMA, novo); } catch { /* sem storage: vale só nesta aba */ }
    setTema(novo);
  };

  // No escuro mostra o sol (vai pro claro); no claro mostra a lua (volta pro escuro).
  const Icone = tema === 'dark' ? Sun : Moon;
  const rotulo = tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
  return (
    <button onClick={trocar} title={rotulo} aria-label={rotulo}
      className={`flex items-center justify-center w-10 h-10 rounded-full text-slate-400 hover:text-white hover:bg-white/5 transition-colors ${className}`}>
      <Icone size={19} />
    </button>
  );
}
