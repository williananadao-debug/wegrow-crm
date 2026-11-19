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

export default function ThemeToggle({ compacto = false, className = '' }: { compacto?: boolean; className?: string }) {
  const [tema, setTema] = useState<'dark' | 'light'>('dark');
  useEffect(() => { void Promise.resolve().then(() => setTema(lerTema())); }, []);

  const trocar = () => {
    const novo = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem(CHAVE_TEMA, novo); } catch { /* sem storage: vale só nesta aba */ }
    setTema(novo);
  };

  const Icone = tema === 'dark' ? Sun : Moon;
  const rotulo = tema === 'dark' ? 'Tema claro' : 'Tema escuro';
  return (
    <button onClick={trocar} title={rotulo} aria-label={rotulo}
      className={`w-full flex items-center gap-4 rounded-2xl transition-all font-semibold text-sm text-slate-400 hover:text-white hover:bg-white/5 ${compacto ? 'justify-center px-3 py-3' : 'px-4 py-3.5'} ${className}`}>
      <Icone size={20} />
      {!compacto && <span>{rotulo}</span>}
    </button>
  );
}
