"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useState } from 'react';
import { 
  LayoutDashboard, 
  Target, // Usado em Metas
  Zap,    // Usado em Vendas
  Settings, 
  LogOut, 
  ShieldCheck,
  Users,
  Briefcase,
  DollarSign,
  ChevronLeft, 
  ChevronRight, 
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { perfil, signOut } = useAuth();
  
  // Estado para controlar se está recolhido ou expandido
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Definição dos itens do menu
  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
    { name: 'Metas', icon: <Target size={20} />, href: '/goals' }, // Nova aba
    { name: 'Vendas', icon: <Zap size={20} />, href: '/deals' },
    { name: 'Produção', icon: <Briefcase size={20} />, href: '/jobs' },
    { name: 'Financeiro', icon: <DollarSign size={20} />, href: '/finance' },
    { name: 'Clientes', icon: <Users size={20} />, href: '/customers' }, 
  ];

  if (perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente') {
    menuItems.push({ 
      name: 'Minha Equipe', 
      icon: <ShieldCheck size={20} />, 
      href: '/dashboard/team' 
    });
  }

  // Função para alternar manualmente
  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <div 
      className={`hidden md:flex flex-col h-full bg-[#0B1120] border-r border-white/5 transition-all duration-300 relative
      ${isCollapsed ? 'w-[80px] p-4' : 'w-[260px] p-6'}`}
    >
      
      {/* BOTÃO DE TOGGLE (ABRIR/FECHAR) */}
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3 top-8 bg-[#22C55E] text-[#0F172A] p-1 rounded-full hover:scale-110 transition-transform shadow-lg z-50"
      >
        {isCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
      </button>

      {/* LOGO */}
      <div className={`flex items-center gap-3 mb-10 text-white transition-all ${isCollapsed ? 'justify-center' : ''}`}>
        <div className="w-10 h-10 min-w-[40px] bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-xl">
          W
        </div>
        
        {/* Esconde o texto se estiver recolhido */}
        {!isCollapsed && (
          <div className="flex flex-col animate-in fade-in duration-300 overflow-hidden whitespace-nowrap">
            <span className="font-bold text-lg tracking-tighter uppercase italic leading-none">wegrow</span>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">
                {perfil?.cargo || 'Visitante'}
            </span>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-2 h-full">
        {menuItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
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

            {/* TOOLTIP (APARECE SÓ QUANDO RECOLHIDO E MOUSE EM CIMA) */}
            {isCollapsed && (
                <div className="absolute left-14 ml-2 px-3 py-1.5 bg-[#1E293B] text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 border border-white/10 translate-x-2 group-hover:translate-x-0">
                    {item.name}
                </div>
            )}
          </Link>
        ))}

        {/* ÁREA INFERIOR */}
        <div className="mt-auto pt-4 border-t border-white/5 space-y-2">
          
          <Link
            href="/settings"
            className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all group relative
            ${pathname === '/settings' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}
            ${isCollapsed ? 'justify-center' : ''}`}
          >
            <Settings size={20} />
            {!isCollapsed && <span className="text-sm font-semibold whitespace-nowrap animate-in fade-in">Configurações</span>}
            
            {/* TOOLTIP CONFIGURAÇÕES */}
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
            {!isCollapsed && <span className="text-sm font-semibold whitespace-nowrap animate-in fade-in">Sair</span>}

            {/* TOOLTIP SAIR */}
            {isCollapsed && (
                <div className="absolute left-14 ml-2 px-3 py-1.5 bg-red-900/90 text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 border border-red-500/20 translate-x-2 group-hover:translate-x-0">
                    Sair
                </div>
            )}
          </button>

        </div>
      </nav>
    </div>
  );
}