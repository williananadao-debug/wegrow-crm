"use client";

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Calendar } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell'; 
import Link from 'next/link';

export default function Topbar() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;

  const pathname = usePathname();

  const getPageTitle = (path: string) => {
    if (!path) return 'Visão Geral';
    if (path.includes('/dashboard')) return 'Dashboard Geral';
    if (path.includes('/deals')) return 'Pipeline de Vendas';
    if (path.includes('/jobs')) return 'Esteira de Produção';
    if (path.includes('/finance')) return 'Gestão Financeira';
    if (path.includes('/customers')) return 'Carteira de Clientes';
    if (path.includes('/goals')) return 'Metas & Performance';
    if (path.includes('/settings')) return 'Configurações';
    if (path.includes('/profile')) return 'Meu Perfil';
    return 'Visão Geral';
  };

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="h-20 bg-[#0B1120] border-b border-white/5 flex items-center justify-between px-8 sticky top-0 z-40 shadow-sm w-full">
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

      {/* A BARRA DE BUSCA FOI REMOVIDA DAQUI PARA NÃO CAUSAR CONFUSÃO */}

      <div className="flex items-center gap-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5 transition-colors cursor-pointer">
            <NotificationBell />
        </div>
        <div className="h-8 w-[1px] bg-white/10"></div>
        
        <Link href="/dashboard/profile" className="flex items-center gap-3 pl-2 cursor-pointer group">
          <div className="text-right hidden lg:block">
            <p className="text-sm font-bold text-white leading-none group-hover:text-[#22C55E] transition-colors">
              {perfil?.nome || user?.email?.split('@')[0] || 'Usuário'}
            </p>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mt-1">
              {perfil?.cargo || 'Membro'}
            </p>
          </div>
          
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#22C55E] to-emerald-800 border border-white/10 flex items-center justify-center text-sm font-black text-[#0F172A] shadow-lg group-hover:scale-105 transition-transform overflow-hidden relative">
            {perfil?.avatar_url ? (
                <img src={perfil.avatar_url} alt="Foto de Perfil" className="w-full h-full object-cover" />
            ) : (
                <span className="uppercase">{perfil?.nome?.[0] || user?.email?.[0] || 'U'}</span>
            )}
          </div>
        </Link>
      </div>
    </header>
  );
}