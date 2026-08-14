"use client";
import { Outfit, Playfair_Display } from 'next/font/google';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Loader2, Radar } from 'lucide-react';

// Fontes carregadas só aqui — não afeta o resto do app, que continua em Inter
// (declarado uma vez só em src/app/layout.tsx). font-family/cor de fundo são
// propriedades herdadas: a declaração explícita no <div> abaixo sobrepõe o
// Inter/navy do body por cascata normal, sem precisar de !important.
// Sem `weight` explícito: as duas são fontes variáveis, então next/font baixa
// 1 arquivo por estilo em vez de um arquivo por peso — tinha ficado pedindo
// 7 pesos estáticos do Outfit + 4 do Playfair (11 arquivos!), o que pesava
// de verdade no primeiro carregamento do Argus.
const outfit = Outfit({ subsets: ['latin'], variable: '--font-argus-sans' });
const playfair = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-argus-serif' });

export default function ArgusLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const empresa = auth.empresa;
  const temArgus = Boolean(empresa?.modulos?.argus);
  // Vertical "veículos" (ex: GB Motors) usa o shell/tema padrão do WeGrow — só
  // "licitação" (ex: Foscarini) pediu identidade visual própria (Outfit+Playfair,
  // dourado/creme). Ver mesma decisão em src/lib/publicPages.ts (hasCustomShell).
  const isVeiculos = (empresa?.modulos?.argus_vertical || 'licitacao') === 'veiculos';

  if (authLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isVeiculos ? 'bg-[#0B1120]' : 'bg-[#faf7f2]'}`}>
        <Loader2 size={24} className={`animate-spin ${isVeiculos ? 'text-[#22C55E]' : 'text-[#d9861c]'}`} />
      </div>
    );
  }

  // Checagem de módulo aqui é só UX (mesmo nível do THOR/Max hoje) — a segurança
  // de verdade é RLS (empresa_id = meu_empresa_id()) + o bearer check de cada
  // rota de API do Argus, não esse gate client-side.
  if (!temArgus) {
    if (isVeiculos) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B1120] px-4 text-white">
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-10 text-center max-w-sm">
            <Radar size={32} className="text-[#22C55E] mx-auto mb-3" />
            <p className="text-slate-400 font-semibold text-sm">O módulo Argus não está ativo pra sua empresa ainda.</p>
          </div>
        </div>
      );
    }
    return (
      <div className={`${outfit.variable} ${playfair.variable} min-h-screen flex items-center justify-center bg-[#faf7f2] px-4`} style={{ fontFamily: 'var(--font-argus-sans)' }}>
        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center max-w-sm shadow-sm">
          <Radar size={32} className="text-[#d9861c] mx-auto mb-3" />
          <p className="text-[#6b6862] font-semibold text-sm">O módulo Argus não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  // Vertical veículos: mesma estrutura de nav própria no topo (ArgusTopNav) que a
  // licitação, mas sem Outfit/Playfair — herda a Inter padrão do WeGrow, só troca
  // o fundo pro navy padrão em vez do creme/dourado da vertical licitação.
  if (isVeiculos) {
    return <div className="min-h-screen bg-[#0B1120]">{children}</div>;
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
