"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Target, 
  Zap, 
  Settings, 
  LogOut, 
  ShieldCheck,
  Users,
  Briefcase,
  DollarSign,
  ChevronLeft, 
  ChevronRight,
  X 
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { perfil, signOut } = useAuth();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Escuta o evento da Topbar para abrir no mobile
  useEffect(() => {
    const handleOpen = () => setIsMobileOpen(true);
    window.addEventListener('open-sidebar', handleOpen);
    return () => window.removeEventListener('open-sidebar', handleOpen);
  }, []);

  // Mantive sua lógica exata de itens de menu
  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
    { name: 'Metas', icon: <Target size={20} />, href: '/goals' },
    { name: 'Vendas', icon: <Zap size={20} />, href: '/deals' },
    { name: 'Produção', icon: <Briefcase size={20} />, href: '/jobs' },
    { name: 'Financeiro', icon: <DollarSign size={20} />, href: '/finance' },
    { name: 'Clientes', icon: <Users size={20} />, href: '/customers' }, 
  ];

  // Mantive sua lógica de permissão de cargo
  if (perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente') {
    menuItems.push({ 
      name: 'Minha Equipe', 
      icon: <ShieldCheck size={20} />, 
      href: '/dashboard/team' 
    });
  }

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <>
      {/* Overlay para fechar no celular */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[60] md:hidden backdrop-blur-sm" 
          onClick={() => setIsMobileOpen(false)} 
        />
      )}

      <div 
        className={`
          fixed inset-y-0 left-0 z-[70] transition-all duration-300 bg-[#0B1120] border-r border-white/5 flex flex-col
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} 
          md:translate-x-0 md:relative
          ${isCollapsed ? 'w-[80px] p-4' : 'w-[260px] p-6'}
        `}
      >
        {/* BOTÃO FECHAR (MOBILE) */}
        <button onClick={() => setIsMobileOpen(false)} className="md:hidden absolute right-4 top-6 text-slate-400">
          <X size={24} />
        </button>

        {/* BOTÃO TOGGLE (DESKTOP) */}
        <button 
          onClick={toggleSidebar}
          className="hidden md:flex absolute -right-3 top-8 bg-[#22C55E] text-[#0F172A] p-1 rounded-full hover:scale-110 transition-transform shadow-lg z-50"
        >
          {isCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
        </button>

        {/* LOGO (Mantive seu design exato) */}
        <div className={`flex items-center gap-3 mb-10 text-white transition-all ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 min-w-[40px] bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-xl">
            W
          </div>
          {!isCollapsed && (
            <div className="flex flex-col animate-in fade-in duration-300 overflow-hidden whitespace-nowrap">
              <span className="font-bold text-lg tracking-tighter uppercase italic leading-none">wegrow</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">
                  {perfil?.cargo || 'Visitante'}
              </span>
            </div>
          )}
        </div>

        {/* LINKS DE NAVEGAÇÃO (Com sua lógica de Active Link e Tooltips) */}
        <nav className="flex flex-col gap-2 h-full">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all group relative
              ${pathname === item.href 
                ? 'bg-[#22C55E]/10 text-[#22C55E]' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'}
              ${isCollapsed ? 'justify-center' : ''}
              `}
            >
              <div className="min-w-[20px]">{item.icon}</div>
              {!isCollapsed && (
                  <span className="text-sm font-semibold whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">
                      {item.name}
                  </span>
              )}

              {/* TOOLTIP (MODO RECOLHIDO) */}
              {isCollapsed && (
                  <div className="absolute left-14 ml-2 px-3 py-1.5 bg-[#1E293B] text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 border border-white/10 translate-x-2 group-hover:translate-x-0">
                      {item.name}
                  </div>
              )}
            </Link>
          ))}

          {/* ÁREA INFERIOR (Configurações e Sair) */}
          <div className="mt-auto pt-4 border-t border-white/5 space-y-2">
            <Link
              href="/settings"
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all group relative
              ${pathname === '/settings' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}
              ${isCollapsed ? 'justify-center' : ''}`}
            >
              <Settings size={20} />
              {!isCollapsed && <span className="text-sm font-semibold">Configurações</span>}
              {isCollapsed && (
                <div className="absolute left-14 ml-2 px-3 py-1.5 bg-[#1E293B] text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 border border-white/10 translate-x-2 group-hover:translate-x-0">
                  Configurações
                </div>
              )}
            </Link>

            <button
              onClick={signOut}
              className={`w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-all text-red-500 hover:bg-red-500/10 cursor-pointer group relative
              ${isCollapsed ? 'justify-center' : ''}`}
            >
              <LogOut size={20} />
              {!isCollapsed && <span className="text-sm font-semibold">Sair</span>}
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}