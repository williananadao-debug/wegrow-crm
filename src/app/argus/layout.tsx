"use client";
import { Outfit, Playfair_Display } from 'next/font/google';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Loader2, Radar } from 'lucide-react';

// Fontes carregadas só aqui — não afeta o resto do app, que continua em Inter
// (declarado uma vez só em src/app/layout.tsx). font-family/cor de fundo são
// propriedades herdadas: a declaração explícita no <div> abaixo sobrepõe o
// Inter/navy do body por cascata normal, sem precisar de !important.
const outfit = Outfit({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-argus-sans' });
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--font-argus-serif' });

export default function ArgusLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const empresa = auth.empresa;
  const temArgus = Boolean(empresa?.modulos?.argus);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf7f2]">
        <Loader2 size={24} className="animate-spin text-[#d9861c]" />
      </div>
    );
  }

  // Checagem de módulo aqui é só UX (mesmo nível do THOR/Max hoje) — a segurança
  // de verdade é RLS (empresa_id = meu_empresa_id()) + o bearer check de cada
  // rota de API do Argus, não esse gate client-side.
  if (!temArgus) {
    return (
      <div className={`${outfit.variable} ${playfair.variable} min-h-screen flex items-center justify-center bg-[#faf7f2] px-4`} style={{ fontFamily: 'var(--font-argus-sans)' }}>
        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center max-w-sm shadow-sm">
          <Radar size={32} className="text-[#d9861c] mx-auto mb-3" />
          <p className="text-[#6b6862] font-semibold text-sm">O módulo Argus não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${outfit.variable} ${playfair.variable} min-h-screen bg-[#faf7f2] text-[#241c14]`}
      style={{ fontFamily: 'var(--font-argus-sans)' }}
    >
      {children}
    </div>
  );
}
