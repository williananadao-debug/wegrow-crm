"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { LayoutDashboard, Target, Wallet, BarChart2, Handshake, Sparkles, Radio } from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

const ITENS = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/prospeccao', label: 'Prospecção', icon: Target },
  { href: '/admin/financeiro', label: 'Financeiro', icon: Wallet },
  { href: '/admin/indicadores', label: 'Indicadores', icon: BarChart2 },
  { href: '/admin/parceiros', label: 'Parceiros', icon: Handshake },
  { href: '/admin/demos', label: 'Demos', icon: Sparkles },
  { href: '/admin/opec', label: 'OPEC', icon: Radio },
];

// Barra de navegação única do console (God Mode) — antes cada tela tinha seu próprio
// "voltar" e a Visão geral uma fileira de 7 botões; aqui fica tudo num lugar só, fixo no topo.
// O gate de acesso de verdade continua em cada página (e nas rotas /api/admin).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth() || {};
  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email || '');

  return (
    <>
      {isAdmin && (
        <div className="sticky top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 pt-1 pb-3 bg-[#0B1120]/85 backdrop-blur-xl print:hidden">
          <div className="max-w-7xl mx-auto flex items-center gap-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5 shrink-0 py-3 pr-2">
              <div className="w-8 h-8 rounded-lg bg-[#0F172A] border border-white/10 flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="WeGrow" className="w-5 h-5 object-contain"/>
              </div>
              <div className="hidden sm:block leading-tight">
                <p className="text-sm font-semibold text-white">WeGrow</p>
                <p className="text-[11px] text-slate-500">Console</p>
              </div>
            </div>
            <nav className="flex items-center gap-1 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ITENS.map(({ href, label, icon: Icon }) => {
                const ativo = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-2 px-3 py-3.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${ativo ? 'border-[#22C55E] text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
                    <Icon size={15} className={ativo ? 'text-[#22C55E]' : ''}/> {label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto hidden md:flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-500 truncate max-w-[180px]">{user?.email}</span>
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#22C55E] to-emerald-700 flex items-center justify-center text-xs font-semibold text-[#0B1120]">
                {(user?.email || '?')[0].toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
