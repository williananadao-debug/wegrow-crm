"use client";
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Radar, LayoutGrid, FileSearch, DollarSign, FileSignature, Bot,
  Grid3x3, LayoutDashboard, HardHat, Activity, Radio, ChevronDown,
} from 'lucide-react';

// Argus não usa a navbar padrão (visual próprio de propósito — ver
// src/lib/publicPages.ts). Obras foi trazido pra dentro do Argus de verdade
// (rotas /argus/obras/*, mesmo visual, mesmas tabelas) — não é mais um link
// pra fora, por isso vira aba nativa igual Licitações/Financeiro/Contratos.
// Os módulos que continuam fora (Dashboard geral, Pulse, THOR, Max) ficam no
// dropdown "outros módulos", senão o Argus vira um beco sem saída.
export default function ArgusTopNav({ nomeEmpresa }: { nomeEmpresa?: string }) {
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
    { href: '/argus', label: 'Painel Geral', icon: LayoutGrid, mostrar: true },
    { href: '/argus/dashboard', label: 'Dashboard', icon: LayoutDashboard, mostrar: modulos.crm !== false },
    { href: '/argus/licitacoes', label: 'Licitações', icon: FileSearch, mostrar: true },
    { href: '/argus/obras', label: 'Obras', icon: HardHat, mostrar: Boolean(modulos.obras) },
    { href: '/argus/financeiro', label: 'Financeiro', icon: DollarSign, mostrar: true },
    { href: '/argus/contratos', label: 'Contratos', icon: FileSignature, mostrar: true },
    { href: '/argus/agente', label: 'Agente IA', icon: Bot, mostrar: true },
  ].filter(i => i.mostrar);

  const outrosModulos = [
    { href: '/pulse', label: 'Pulse', icon: Activity, mostrar: Boolean(modulos.pulse) },
    { href: '/thor', label: 'THOR', icon: Bot, mostrar: Boolean(modulos.thor) },
    { href: '/max', label: 'Max', icon: Radio, mostrar: Boolean(modulos.max) },
  ].filter(m => m.mostrar);

  return (
    <nav className="bg-white border-b border-[#e5e0d5] sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center gap-2">
        <div className="flex items-center gap-2 mr-6 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#241c14] flex items-center justify-center">
            <Radar size={18} className="text-[#d9861c]" />
          </div>
          <div className="leading-none">
            <p className="text-[13px] font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-argus-serif)' }}>Argus</p>
            <p className="text-[9px] text-[#9a958a] font-semibold uppercase tracking-wide">{nomeEmpresa || 'Licitações'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {itens.map(item => {
            const ativo = item.href === '/argus' ? pathname === '/argus' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all ${ativo ? 'bg-[#fdf0d4] text-[#d9861c]' : 'text-[#6b6862] hover:bg-[#f7f6f3] hover:text-[#241c14]'}`}>
                <Icon size={14} /> {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 bg-[#fdf0d4] border border-[#f0d19a] px-3 py-1.5 rounded-full flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1fa85a] animate-pulse" />
          <span className="text-[10px] font-bold text-[#d9861c] uppercase tracking-wide">PNCP · Sync ativo</span>
        </div>

        {outrosModulos.length > 0 && (
          <div className="relative flex-shrink-0" ref={ref}>
            <button onClick={() => setOutrosAbertos(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold text-[#6b6862] hover:bg-[#f7f6f3] hover:text-[#241c14] transition-all">
              <Grid3x3 size={16} /> <ChevronDown size={12} className={`transition-transform ${outrosAbertos ? 'rotate-180' : ''}`} />
            </button>
            {outrosAbertos && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-[#e5e0d5] rounded-xl shadow-lg py-1.5 min-w-[190px] z-40">
                <p className="text-[9px] font-bold text-[#9a958a] uppercase tracking-wide px-3 py-1.5">Outros módulos</p>
                {outrosModulos.map(m => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.href} href={m.href} onClick={() => setOutrosAbertos(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[12px] font-semibold text-[#241c14] hover:bg-[#faf7f2] transition-all">
                      <Icon size={14} className="text-[#9a958a]" /> {m.label}
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
