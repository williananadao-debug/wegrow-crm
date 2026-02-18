"use client";

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Search, Calendar } from 'lucide-react';

// AJUSTE CRÍTICO: Importando do arquivo que você mandou agora (NotificationBell.tsx)
// Se o arquivo na pasta for minúsculo (notification-bell.tsx), mude aqui.
import NotificationBell from '@/components/NotificationBell'; 

export default function Topbar() {
  const { user, perfil } = useAuth();
  const pathname = usePathname();

  // Função para dar nome à página baseado na URL
  const getPageTitle = (path: string) => {
    if (path.includes('/dashboard')) return 'Dashboard Geral';
    if (path.includes('/deals')) return 'Pipeline de Vendas';
    if (path.includes('/jobs')) return 'Esteira de Produção';
    if (path.includes('/finance')) return 'Gestão Financeira';
    if (path.includes('/customers')) return 'Carteira de Clientes';
    if (path.includes('/goals')) return 'Metas & Performance';
    if (path.includes('/settings')) return 'Configurações';
    return 'Visão Geral';
  };

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="h-20 bg-[#0B1120] border-b border-white/5 flex items-center justify-between px-8 sticky top-0 z-40 shadow-sm w-full">
      
      {/* LADO ESQUERDO: Título + Data */}
      <div className="flex flex-col justify-center">
        <h1 className="text-xl font-black italic text-white tracking-tighter uppercase leading-none">
          {getPageTitle(pathname)}
        </h1>
        <div className="flex items-center gap-2 mt-1">
            <Calendar size={12} className="text-slate-500"/>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {today}
            </p>
        </div>
      </div>

      {/* CENTRO: Barra de Busca */}
      <div className="hidden xl:flex items-center bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-2.5 w-96 focus-within:border-[#22C55E]/50 focus-within:bg-white/[0.05] transition-all">
        <Search size={18} className="text-slate-500 mr-3" />
        <input 
          type="text" 
          placeholder="Buscar..." 
          className="bg-transparent border-none outline-none text-xs text-white font-bold placeholder-slate-600 w-full uppercase tracking-wide"
        />
      </div>

      {/* LADO DIREITO: Ações + Perfil */}
      <div className="flex items-center gap-6">
        
        {/* Sino de Notificações */}
        <div className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5 transition-colors">
            <NotificationBell />
        </div>

        <div className="h-8 w-[1px] bg-white/10"></div>

        {/* Perfil */}
        <div className="flex items-center gap-3 pl-2 cursor-pointer group">
          <div className="text-right hidden lg:block">
            <p className="text-sm font-bold text-white leading-none group-hover:text-[#22C55E] transition-colors">
              {perfil?.nome || user?.email?.split('@')[0]}
            </p>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mt-1">
              {perfil?.cargo || 'Membro'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#22C55E] to-emerald-800 border border-white/10 flex items-center justify-center text-sm font-black text-[#0F172A] shadow-lg group-hover:scale-105 transition-transform">
            {user?.email?.[0].toUpperCase()}
          </div>
        </div>

      </div>
    </header>
  );
}