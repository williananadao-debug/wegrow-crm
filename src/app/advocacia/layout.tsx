"use client";
import { Outfit, Playfair_Display } from 'next/font/google';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Loader2, Scale } from 'lucide-react';

// Fontes carregadas só aqui — não afeta o resto do app, que continua em Inter (declarado uma
// vez só em src/app/layout.tsx). Mesmo padrão do Argus (src/app/argus/layout.tsx): sem `weight`
// explícito porque as duas são fontes variáveis, evita baixar um arquivo por peso.
const outfit = Outfit({ subsets: ['latin'], variable: '--font-advocacia-sans' });
const playfair = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-advocacia-serif' });

export default function AdvocaciaLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const empresa = auth.empresa;
  const temAdvocacia = Boolean(empresa?.modulos?.advocacia);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf7f2]">
        <Loader2 size={24} className="animate-spin text-[#d9861c]" />
      </div>
    );
  }

  // Checagem de módulo aqui é só UX (mesmo nível do Argus/THOR/Max hoje) — a segurança de
  // verdade é RLS (empresa_id = meu_empresa_id()) + o bearer check de cada rota de API.
  if (!temAdvocacia) {
    return (
      <div className={`${outfit.variable} ${playfair.variable} min-h-screen flex items-center justify-center bg-[#faf7f2] px-4`} style={{ fontFamily: 'var(--font-advocacia-sans)' }}>
        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center max-w-sm shadow-sm">
          <Scale size={32} className="text-[#d9861c] mx-auto mb-3" />
          <p className="text-[#6b6862] font-semibold text-sm">O módulo Advocacia não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${outfit.variable} ${playfair.variable} min-h-screen bg-[#faf7f2] text-[#241c14]`}
      style={{ fontFamily: 'var(--font-advocacia-sans)' }}
    >
      {children}
    </div>
  );
}
