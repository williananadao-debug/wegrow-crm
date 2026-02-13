"use client";
import { Search, Bell, Settings } from 'lucide-react';

interface TopbarProps {
  user?: {
    name: string;
    role: string;
    avatar_url?: string;
  };
}

export function Topbar({ user = { name: "Willian", role: "Owner" } }: TopbarProps) {
  // Lógica para pegar a inicial caso não tenha foto
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <header className="flex items-center justify-between mb-8 gap-4">
      {/* Campo de Busca Glass */}
      <div className="relative flex-1 max-w-xl group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#22C55E] transition-colors" size={18} />
        <input 
          type="text" 
          placeholder="Buscar no sistema..." 
          className="w-full bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl py-3 pl-12 pr-4 text-sm text-white outline-none focus:border-[#22C55E30] focus:bg-white/[0.05] transition-all"
        />
      </div>

      <div className="flex items-center gap-3">
        {/* Notificações (Opcional, mas dá um ar mais "SaaS") */}
        <button className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-slate-500 hover:text-white transition-colors">
          <Bell size={18} />
        </button>

        {/* Perfil com Avatar Dinâmico */}
        <div className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.08] p-1.5 pr-5 rounded-2xl hover:bg-white/[0.05] transition-all cursor-pointer">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-[#22C55E] to-[#16a34a] rounded-xl flex items-center justify-center font-black text-[#0F172A] overflow-hidden shadow-lg shadow-[#22C55E]/10">
              {user.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt={user.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            {/* Status Online Indicator */}
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[#22C55E] border-2 border-[#0B1120] rounded-full"></div>
          </div>

          <div className="hidden md:block leading-none">
            <p className="text-xs font-black text-white italic uppercase tracking-tight">{user.name}</p>
            <p className="text-[9px] text-slate-500 uppercase font-black mt-1 tracking-widest">{user.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}