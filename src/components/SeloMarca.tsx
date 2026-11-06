"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

export type MarcaParceiro = { slug: string; produto: string; logo_url: string | null; parceiro: string };

const CHAVE = 'wg_marca_parceiro';
const VALIDADE_MS = 60 * 60 * 1000;

// Marca dupla da empresa logada (empresa da carteira de um parceiro com marca ativa, ex.:
// "WeGrow for Manager" pras rádios da YoungTech). Cache de 1h no navegador.
export function useMarcaParceiro(): MarcaParceiro | null {
  const { user } = useAuth() || {};
  const [registro, setRegistro] = useState<{ userId: string; em: number; marca: MarcaParceiro | null } | null>(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; }
  });

  useEffect(() => {
    if (!user?.id) return;
    if (registro && registro.userId === user.id && Date.now() - registro.em < VALIDADE_MS) return;
    let vivo = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      const res = await fetch('/api/conta/marca', { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      const json = res?.ok ? await res.json().catch(() => null) : null;
      if (!vivo || !json) return;
      const novo = { userId: user.id, em: Date.now(), marca: json.marca || null };
      setRegistro(novo);
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novo));
        // A tela de login lembra a marca dupla de quem já entrou por ela
        if (novo.marca?.slug) localStorage.setItem('wg_marca_login', novo.marca.slug);
      } catch { /* sem cache */ }
    });
    return () => { vivo = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return registro && user && registro.userId === user.id ? registro.marca : null;
}

// Logo do parceiro sobre fundo escuro com brilho verde (o do Manager é transparente, com glow próprio)
function LogoParceiro({ marca, px }: { marca: MarcaParceiro; px: number }) {
  return (
    <div className="relative shrink-0 rounded-xl bg-[#0B1120] border border-[#22C55E]/25 flex items-center justify-center overflow-hidden shadow-[0_0_16px_-4px_rgba(74,222,128,0.5)]" style={{ width: px, height: px }}>
      {marca.logo_url ? <img src={marca.logo_url} alt={marca.produto} className="w-full h-full object-contain p-0.5"/> : <img src="/logo.png" alt="WeGrow" className="w-2/3 h-2/3"/>}
    </div>
  );
}

// Selo "WeGrow for <produto>" no rodapé do menu. compacto = menu recolhido (só o logo).
export default function SeloMarca({ compacto = false }: { compacto?: boolean }) {
  const marca = useMarcaParceiro();
  if (!marca) return null;
  if (compacto) {
    return (
      <div className="flex justify-center" title={`WeGrow for ${marca.produto}`}>
        <LogoParceiro marca={marca} px={40}/>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#22C55E]/10 to-white/[0.02] border border-[#22C55E]/20 px-3 py-2.5">
      <LogoParceiro marca={marca} px={36}/>
      <div className="min-w-0 leading-tight">
        <p className="text-[13px] font-semibold text-white truncate">WeGrow <span className="text-[#4ADE80] italic font-normal">for</span> {marca.produto}</p>
        <p className="text-[10px] text-slate-500 truncate">com {marca.parceiro}</p>
      </div>
    </div>
  );
}

// Chip da barra de cima (desktop): assinatura da marca dupla ao lado do título da página
export function ChipMarca() {
  const marca = useMarcaParceiro();
  if (!marca) return null;
  return (
    <div className="hidden lg:flex items-center gap-2.5 rounded-full border border-[#22C55E]/25 bg-gradient-to-r from-[#22C55E]/10 via-white/[0.03] to-[#22C55E]/10 pl-2 pr-4 py-1.5 shadow-[0_0_24px_-8px_rgba(74,222,128,0.6)]" title={`WeGrow for ${marca.produto} · com ${marca.parceiro}`}>
      <img src="/logo.png" alt="WeGrow" className="w-6 h-6"/>
      <span className="text-xs font-black italic text-white tracking-tight">WeGrow</span>
      <span className="text-xs italic text-[#4ADE80]">for</span>
      {marca.logo_url && <img src={marca.logo_url} alt="" className="w-7 h-7 object-contain drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]"/>}
      <span className="text-xs font-black text-white tracking-tight">{marca.produto}</span>
    </div>
  );
}
