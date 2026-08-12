"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radar, LayoutGrid, FileSearch, DollarSign, FileSignature, Bot } from 'lucide-react';

const ITENS = [
  { href: '/argus', label: 'Painel Geral', icon: LayoutGrid },
  { href: '/argus/licitacoes', label: 'Licitações', icon: FileSearch },
  { href: '/argus/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/argus/contratos', label: 'Contratos', icon: FileSignature },
  { href: '/argus/agente', label: 'Agente IA', icon: Bot },
];

export default function ArgusTopNav({ nomeEmpresa }: { nomeEmpresa?: string }) {
  const pathname = usePathname();
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
          {ITENS.map(item => {
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
      </div>
    </nav>
  );
}
