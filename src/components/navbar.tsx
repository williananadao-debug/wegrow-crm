"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useState } from 'react';
import { 
  LayoutDashboard, Target, Zap, Settings, LogOut, ShieldCheck,
  Users, Briefcase, DollarSign, ChevronLeft, ChevronRight,
  Rocket, BarChart3, Menu, X
} from 'lucide-react';
import NotificationBell from '@/components/NotificationBell'; 

export default function Navbar() {
  const pathname = usePathname();
  
  // BLINDAGEM CONTRA A VERCEL
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const signOut = auth.signOut || (() => {});
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';
  const isManager = perfil?.cargo === 'gerente';

  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
    { name: 'Metas', icon: <Target size={20} />, href: '/goals' },
    { name: 'Vendas', icon: <Zap size={20} />, href: '/deals' }, 
    { name: 'Produção', icon: <Briefcase size={20} />, href: '/jobs' },
    { name: 'Clientes', icon: <Users size={20} />, href: '/customers' }, 
  ];

  if (isDirector || isManager) {
    if (isDirector) {
      menuItems.splice(1, 0, { name: 'Estratégia', icon: <Rocket size={20} />, href: '/dashboard/premises' });
      menuItems.splice(2, 0, { name: 'Relatórios', icon: <BarChart3 size={20} />, href: '/reports' });
    } else {
      menuItems.push({ name: 'Relatórios', icon: <BarChart3 size={20} />, href: '/reports' });
    }
    menuItems.push({ name: 'Minha Equipe', icon: <ShieldCheck size={20} />, href: '/dashboard/team' });
  }

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#0B1120]/95 backdrop-blur-md border-b border-white/10 z-[60] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsMobileOpen(true)} className="p-1 text-slate-400 hover:text-white transition-colors">
            <Menu size={26} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#22C55E] rounded-lg flex items-center justify-center font-black text-[#0F172A] text-lg">W</div>
            <span className="text-lg font-black italic text-white tracking-tighter">WEGROW</span>
          </div>
        </div>
        <NotificationBell />
      </div>

      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] md:hidden" onClick={() => setIsMobileOpen(false)} />
      )}
      
      <aside className={`fixed top-0 left-0 bottom-0 w-[280px] bg-[#0B1120] border-r border-white/10 z-[80] md:hidden transition-transform duration-300 flex flex-col py-6 px-6 shadow-2xl ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3 text-white">
              <div className="w-10 h-10 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-xl">W</div>
              <div className="flex flex-col leading-none">
                <span className="font-bold text-lg tracking-tighter uppercase italic">WEGROW</span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">{perfil?.cargo || 'Membro'}</span>
              </div>
            </div>
            <button onClick={() => setIsMobileOpen(false)} className="text-slate-500 hover:text-white bg-white/5 p-2 rounded-full"><X size={18}/></button>
        </div>

        <nav className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {item.icon} {item.name}
            </Link>
          ))}

          <div className="mt-auto pt-4 border-t border-white/5 space-y-2">
            <Link href="/settings" onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm ${pathname === '/settings' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <Settings size={20} /> Configurações
            </Link>
            <button onClick={() => { setIsMobileOpen(false); signOut(); }} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm text-red-500 hover:bg-red-500/10">
              <LogOut size={20} /> Sair
            </button>
          </div>
        </nav>
      </aside>

      <aside className={`hidden md:flex flex-col h-screen sticky top-0 bg-[#0B1120] border-r border-white/5 transition-all duration-300 z-50 ${isCollapsed ? 'w-[80px]' : 'w-[260px]'}`}>
        <button onClick={toggleSidebar} className="absolute -right-3 top-9 bg-[#22C55E] text-[#0F172A] p-1 rounded-full hover:scale-110 transition-transform shadow-[0_0_15px_rgba(34,197,94,0.4)] z-50 flex items-center justify-center">
          {isCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
        </button>

        <div className={`flex flex-col h-full overflow-hidden ${isCollapsed ? 'px-4' : 'px-6'} py-6`}>
            <div className={`flex items-center gap-3 mb-10 text-white transition-all ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="w-10 h-10 min-w-[40px] bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-xl">W</div>
              <div className={`flex flex-col overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                <span className="font-bold text-lg tracking-tighter uppercase italic leading-none">wegrow</span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">{perfil?.cargo || 'Visitante'}</span>
              </div>
            </div>

            <nav className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
              {menuItems.map((item) => (
                <Link key={item.name} href={item.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all group relative ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'} ${isCollapsed ? 'justify-center' : ''}`}>
                  <div className="min-w-[20px]">{item.icon}</div>
                  <span className={`text-sm font-semibold whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>{item.name}</span>
                  {isCollapsed && (
                      <div className="absolute left-14 ml-2 px-3 py-1.5 bg-[#1E293B] text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[60] border border-white/10 translate-x-2 group-hover:translate-x-0">
                          {item.name}
                      </div>
                  )}
                </Link>
              ))}

              <div className="mt-auto pt-4 border-t border-white/5 space-y-2">
                <Link href="/settings" className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all group relative ${pathname === '/settings' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'} ${isCollapsed ? 'justify-center' : ''}`}>
                  <Settings size={20} />
                  <span className={`text-sm font-semibold whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Configurações</span>
                </Link>
                <button onClick={signOut} className={`w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-all text-red-500 hover:bg-red-500/10 cursor-pointer group relative ${isCollapsed ? 'justify-center' : ''}`}>
                  <LogOut size={20} />
                  <span className={`text-sm font-semibold whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Sair</span>
                </button>
              </div>
            </nav>
        </div>
      </aside>
    </>
  );
}