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
  // As duas verticais usam a mesma estrutura visual do Argus (Outfit+Playfair,
  // cartões claros) — só a paleta muda: licitação (ex: Foscarini) é dourado/creme,
  // veículos (ex: GB Motors) é cinza/preto (cor da marca do cliente). Ver mesma
  // decisão em ArgusTopNav.tsx.
  const isVeiculos = (empresa?.modulos?.argus_vertical || 'licitacao') === 'veiculos';
  const bgFundo = isVeiculos ? 'bg-[#f2f2f2]' : 'bg-[#faf7f2]';
  const corTexto = isVeiculos ? 'text-[#171717]' : 'text-[#241c14]';
  const corAccent = isVeiculos ? 'text-[#171717]' : 'text-[#d9861c]';
  const corBorda = isVeiculos ? 'border-[#e0e0e0]' : 'border-[#e5e0d5]';
  const corMuted = isVeiculos ? 'text-[#5c5c5c]' : 'text-[#6b6862]';

  if (authLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgFundo}`}>
        <Loader2 size={24} className={`animate-spin ${corAccent}`} />
      </div>
    );
  }

  // Checagem de módulo aqui é só UX (mesmo nível do THOR/Max hoje) — a segurança
  // de verdade é RLS (empresa_id = meu_empresa_id()) + o bearer check de cada
  // rota de API do Argus, não esse gate client-side.
  if (!temArgus) {
    return (
      <div className={`${outfit.variable} ${playfair.variable} min-h-screen flex items-center justify-center ${bgFundo} px-4`} style={{ fontFamily: 'var(--font-argus-sans)' }}>
        <div className={`bg-white border ${corBorda} rounded-2xl p-10 text-center max-w-sm shadow-sm`}>
          <Radar size={32} className={`${corAccent} mx-auto mb-3`} />
          <p className={`${corMuted} font-semibold text-sm`}>O módulo Argus não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${outfit.variable} ${playfair.variable} min-h-screen ${bgFundo} ${corTexto}`}
      style={{ fontFamily: 'var(--font-argus-sans)' }}
    >
      {children}
    </div>
  );
}
