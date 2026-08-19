"use client";
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Scale, LayoutGrid, GitBranch, DollarSign, Sparkles, Users,
  Grid3x3, ChevronDown, Activity, Bot, Radio,
} from 'lucide-react';

// Logo real da empresa (Admin → Logo), mesmo padrão de MarcaEmpresaArgus.
function MarcaEmpresaAdvocacia({ logoUrl, inicial }: { logoUrl?: string | null; inicial: string }) {
  if (logoUrl) {
    return (
      <div className="bg-white border border-[#e5e0d5] rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 w-10 h-10">
        <img src={logoUrl} alt="" className="w-full h-full object-contain p-1" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#241c14]">
      <Scale size={19} className="text-[#d9861c]" />
    </div>
  );
}

// Advocacia não usa a navbar padrão (visual próprio de propósito, mesma decisão do Argus —
// ver src/lib/publicPages.ts). Os outros módulos ficam num dropdown "outros módulos".
export default function AdvocaciaTopNav({ nomeEmpresa }: { nomeEmpresa?: string }) {
  const pathname = usePathname();
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  const modulos = empresa?.modulos || {};
  const [outrosAbertos, setOutrosAbertos] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOutrosAbertos(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, []);

  const itens = [
    { href: '/advocacia', label: 'Painel', icon: LayoutGrid, mostrar: true },
    { href: '/advocacia/processos', label: 'Processos', icon: GitBranch, mostrar: true },
    { href: '/advocacia/clientes', label: 'Clientes', icon: Users, mostrar: true },
    { href: '/advocacia/financeiro', label: 'Financeiro', icon: DollarSign, mostrar: true },
    { href: '/advocacia/inteligencia', label: 'Inteligência', icon: Sparkles, mostrar: true },
  ].filter(i => i.mostrar);

  const outrosModulos = [
    { href: '/pulse', label: 'Pulse', icon: Activity, mostrar: Boolean(modulos.pulse) },
    { href: '/thor', label: 'THOR', icon: Bot, mostrar: Boolean(modulos.thor) },
    { href: '/max', label: 'Max', icon: Radio, mostrar: Boolean(modulos.max) },
  ].filter(m => m.mostrar);

  return (
    <nav className="bg-white border-b border-[#e5e0d5] sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-6 h-[72px] flex items-center gap-3">
        <div className="flex items-center gap-3 mr-6 flex-shrink-0">
          <MarcaEmpresaAdvocacia logoUrl={empresa?.logo_url} inicial={(nomeEmpresa || 'A').charAt(0).toUpperCase()} />
          <div className="leading-tight">
            <p className="text-[15px] font-bold text-[#241c14]">{nomeEmpresa || 'Advocacia'}</p>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[#9a958a]" style={{ fontFamily: 'var(--font-advocacia-serif)' }}>
              Advocacia · CRM jurídico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {itens.map(item => {
            const ativo = item.href === '/advocacia' ? pathname === '/advocacia' : pathname.startsWith(item.href);
            const Icon = item.icon;
            const classesAtivo = ativo ? 'bg-[#fdf0d4] text-[#d9861c]' : 'text-[#6b6862] hover:bg-[#f7f6f3] hover:text-[#241c14]';
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold whitespace-nowrap transition-all ${classesAtivo}`}>
                <Icon size={16} /> {item.label}
              </Link>
            );
          })}
        </div>

        {outrosModulos.length > 0 && (
          <div className="relative flex-shrink-0" ref={ref}>
            <button onClick={() => setOutrosAbertos(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[14px] font-semibold transition-all text-[#6b6862] hover:bg-[#f7f6f3] hover:text-[#241c14]">
              <Grid3x3 size={18} /> <ChevronDown size={13} className={`transition-transform ${outrosAbertos ? 'rotate-180' : ''}`} />
            </button>
            {outrosAbertos && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-[#e5e0d5] rounded-xl shadow-lg py-1.5 min-w-[200px] z-40">
                <p className="text-[12px] font-bold uppercase tracking-wide px-3 py-1.5 text-[#9a958a]">Outros módulos</p>
                {outrosModulos.map(m => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.href} href={m.href} onClick={() => setOutrosAbertos(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-semibold transition-all text-[#241c14] hover:bg-[#faf7f2]">
                      <Icon size={15} className="text-[#9a958a]" /> {m.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
