"use client";
import { Menu, Bell, User, Search } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function Topbar() {
  const { perfil } = useAuth();

  return (
    <header className="h-16 border-b border-white/5 bg-[#0B1120] flex items-center justify-between px-4 md:px-8 w-full">
      <div className="flex items-center gap-4">
        {/* BOTÃO HAMBÚRGUER - Crucial para aparecer em celulares "em pé" (md:hidden) */}
        <button 
          onClick={() => window.dispatchEvent(new Event('open-sidebar'))}
          className="md:hidden p-2.5 text-white hover:bg-white/10 rounded-xl transition-all bg-white/5 border border-white/10 active:scale-95"
        >
          <Menu size={22} />
        </button>
        
        {/* Logo que aparece apenas no Mobile ao lado do botão */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-7 h-7 bg-[#22C55E] rounded-lg flex items-center justify-center font-black text-[#0F172A] text-xs">W</div>
          <span className="font-bold text-sm tracking-tighter uppercase italic text-white">wegrow</span>
        </div>

        {/* Título que aparece no Desktop */}
        <div className="hidden md:flex items-center gap-2 text-sm">
          <span className="text-slate-500 font-medium italic">Painel</span>
          <span className="text-slate-700">/</span>
          <span className="text-white font-semibold">Dashboard Principal</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6">
        {/* Busca rápida (escondida em celulares muito pequenos) */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/5 rounded-lg text-slate-500">
          <Search size={14} />
          <span className="text-xs">Buscar...</span>
        </div>

        <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#22C55E] rounded-full border-2 border-[#0B1120]"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-2 border-l border-white/5">
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-xs font-bold text-white leading-none">{perfil?.nome || 'Usuário'}</span>
            <span className="text-[10px] text-[#22C55E] uppercase font-black mt-1 tracking-widest">{perfil?.cargo || 'Membro'}</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/20 flex items-center justify-center text-[#22C55E] shadow-[0_0_15px_rgba(34,197,94,0.1)]">
            <User size={20} />
          </div>
        </div>
      </div>
    </header>
  );
}