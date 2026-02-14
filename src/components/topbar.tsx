"use client";
import { Menu, Bell, User, Search } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { usePathname } from 'next/navigation'; // Importante para saber onde estamos

export default function Topbar() {
  const { perfil } = useAuth();
  const pathname = usePathname();

  // DICIONÁRIO DE TÍTULOS
  // Aqui a mágica acontece: traduzimos a rota "feia" para um nome bonito
  const pageNames: { [key: string]: string } = {
    '/dashboard': 'Visão Geral',
    '/': 'Visão Geral',
    '/goals': 'Metas e Performance',
    '/deals': 'Funil de Vendas',
    '/jobs': 'Esteira de Produção',
    '/finance': 'Gestão Financeira',
    '/customers': 'Carteira de Clientes',
    '/settings': 'Configurações do Sistema',
    '/dashboard/team': 'Gestão de Equipe'
  };

  // Se a rota não estiver na lista (ex: página de detalhes), usa um padrão
  const currentTitle = pageNames[pathname] || 'WeGrow CRM';

  return (
    // Mudei h-16 para h-14 (Mais fino e elegante)
    <header className="h-14 border-b border-white/5 bg-[#0B1120] flex items-center justify-between px-4 md:px-6 w-full sticky top-0 z-40">
      
      <div className="flex items-center gap-4">
        {/* BOTÃO HAMBÚRGUER (MOBILE) - Mantido igual pois funciona */}
        <button 
          onClick={() => window.dispatchEvent(new Event('open-sidebar'))}
          className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-all bg-white/5 border border-white/10 active:scale-95"
        >
          <Menu size={20} />
        </button>
        
        {/* LOGO (MOBILE) */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-6 h-6 bg-[#22C55E] rounded flex items-center justify-center font-black text-[#0F172A] text-[10px]">W</div>
          <span className="font-bold text-xs tracking-tighter uppercase italic text-white">wegrow</span>
        </div>

        {/* TÍTULO DINÂMICO (DESKTOP) */}
        <div className="hidden md:flex items-center gap-2 text-sm animate-in fade-in duration-300">
          <span className="text-slate-500 font-medium italic">WeGrow</span>
          <span className="text-slate-700">/</span>
          {/* Aqui entra o nome da página atual */}
          <span className="text-white font-semibold tracking-tight">{currentTitle}</span>
        </div>
      </div>

      {/* LADO DIREITO (Busca, Notificação, Perfil) */}
      <div className="flex items-center gap-3 md:gap-4">
        
        {/* Busca - Compacta */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/5 rounded-full text-slate-500 hover:bg-white/10 transition-colors w-48 focus-within:w-64 focus-within:bg-white/10 focus-within:text-white duration-300">
          <Search size={14} />
          <input 
            type="text" 
            placeholder="Buscar..." 
            className="bg-transparent border-none outline-none text-xs w-full placeholder:text-slate-600 text-white"
          />
        </div>

        <div className="h-4 w-[1px] bg-white/10 hidden sm:block"></div>

        <button className="relative p-1.5 text-slate-400 hover:text-white transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#22C55E] rounded-full ring-2 ring-[#0B1120]"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-2">
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-xs font-bold text-white leading-none">{perfil?.nome || 'Admin'}</span>
            <span className="text-[10px] text-[#22C55E] uppercase font-black mt-0.5 tracking-widest opacity-80">{perfil?.cargo || 'Membro'}</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#22C55E] flex items-center justify-center text-[#0B1120] font-bold shadow-[0_0_10px_rgba(34,197,94,0.2)]">
            <User size={18} />
          </div>
        </div>
      </div>
    </header>
  );
}