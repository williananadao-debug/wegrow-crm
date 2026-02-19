"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, Target, Zap, Briefcase, 
  Menu, Users, DollarSign, BarChart3, ShieldCheck, Settings, LogOut, X 
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function MobileNav() {
  const pathname = usePathname();
  const { perfil, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';
  const isManager = perfil?.cargo === 'gerente';

  // --- 1. MENUS PRINCIPAIS (Sempre visíveis na barra inferior) ---
  const mainTabs = [
    { name: 'Dash', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
    { name: 'Vendas', icon: <Zap size={20} />, href: '/deals' },
    { name: 'Produção', icon: <Briefcase size={20} />, href: '/jobs' },
    { name: 'Metas', icon: <Target size={20} />, href: '/goals' },
  ];

  // --- 2. MENUS SECUNDÁRIOS (Ficam escondidos no botão "Mais") ---
  const extraTabs = [
    { name: 'Clientes', icon: <Users size={20} />, href: '/customers' },
    { name: 'Financeiro', icon: <DollarSign size={20} />, href: '/finance' },
  ];

  if (isDirector || isManager) {
      extraTabs.push({ name: 'Relatórios', icon: <BarChart3 size={20} />, href: '/reports' });
      extraTabs.push({ name: 'Minha Equipe', icon: <ShieldCheck size={20} />, href: '/dashboard/team' });
  }

  return (
    <>
      {/* OVERLAY ESCURO (Aparece quando abre o menu "Mais") */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99] md:hidden transition-all duration-300"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* PAINEL DESLIZANTE DO MENU "MAIS" */}
      <div 
        className={`fixed bottom-20 left-4 right-4 bg-[#0F172A] border border-white/10 rounded-3xl p-4 shadow-2xl z-[100] md:hidden transition-all duration-500 ease-in-out transform ${
          isMenuOpen ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-10 opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
            <span className="text-white font-black uppercase italic tracking-widest text-xs">Mais Opções</span>
            <button onClick={() => setIsMenuOpen(false)} className="text-slate-500 hover:text-white p-1 bg-white/5 rounded-full"><X size={16}/></button>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
            {extraTabs.map((tab) => (
              <Link 
                key={tab.name} 
                href={tab.href}
                onClick={() => setIsMenuOpen(false)}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${pathname === tab.href ? 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-transparent'}`}
              >
                {tab.icon}
                <span className="text-[10px] font-black uppercase tracking-wider">{tab.name}</span>
              </Link>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
            <Link 
                href="/settings"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center justify-center gap-2 bg-white/5 text-slate-400 p-3 rounded-xl hover:text-white hover:bg-white/10 transition-colors"
            >
                <Settings size={16}/> <span className="text-[10px] font-bold uppercase">Ajustes</span>
            </Link>
            <button 
                onClick={() => { setIsMenuOpen(false); signOut(); }}
                className="flex items-center justify-center gap-2 bg-red-500/10 text-red-500 p-3 rounded-xl hover:bg-red-500 hover:text-white transition-colors"
            >
                <LogOut size={16}/> <span className="text-[10px] font-bold uppercase">Sair</span>
            </button>
        </div>
      </div>

      {/* BARRA INFERIOR FIXA (BOTTOM NAVIGATION BAR) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-[#0B1120]/95 backdrop-blur-md border-t border-white/10 z-[100] flex justify-around items-center px-2 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        
        {/* Renderiza os 4 itens principais */}
        {mainTabs.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.name} 
              href={item.href}
              onClick={() => setIsMenuOpen(false)} // Fecha o menu "mais" se estiver aberto
              className="flex flex-col items-center justify-center w-full h-full relative group"
            >
              <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-[#22C55E]/20 text-[#22C55E] scale-110 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'text-slate-500'}`}>
                {item.icon}
              </div>
              <span className={`text-[8px] font-black uppercase mt-1 transition-all ${isActive ? 'text-[#22C55E] opacity-100' : 'text-slate-500 opacity-70'}`}>
                {item.name}
              </span>
              {isActive && <div className="absolute top-0 w-8 h-1 bg-[#22C55E] rounded-b-full shadow-[0_0_10px_#22C55E]"></div>}
            </Link>
          );
        })}

        {/* O BOTÃO MÁGICO "MAIS" */}
        <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex flex-col items-center justify-center w-full h-full relative"
        >
            <div className={`p-1.5 rounded-xl transition-all duration-300 ${isMenuOpen ? 'bg-blue-600/20 text-blue-400 scale-110 shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'text-slate-500'}`}>
                <Menu size={20} />
            </div>
            <span className={`text-[8px] font-black uppercase mt-1 transition-all ${isMenuOpen ? 'text-blue-400 opacity-100' : 'text-slate-500 opacity-70'}`}>
                Menu
            </span>
            {isMenuOpen && <div className="absolute top-0 w-8 h-1 bg-blue-500 rounded-b-full shadow-[0_0_10px_#3B82F6]"></div>}
        </button>

      </nav>
    </>
  );
}