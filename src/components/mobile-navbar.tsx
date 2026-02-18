"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Target, 
  Briefcase, 
  DollarSign, 
  Menu,
  X,
  Users,
  ShieldCheck,
  Settings,
  LogOut
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function MobileNavbar() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { name: 'Dash', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Metas', href: '/goals', icon: <Target size={20} /> },
    { name: 'Jobs', href: '/jobs', icon: <Briefcase size={20} /> },
    { name: 'Caixa', href: '/finance', icon: <DollarSign size={20} /> },
  ];

  return (
    <>
      {/* MENU EXTRA (OVERLAY) */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-sm flex flex-col justify-end pb-24 px-6 animate-in slide-in-from-bottom-10 md:hidden">
            <button 
                onClick={() => setIsMenuOpen(false)} 
                className="absolute top-6 right-6 p-2 bg-white/10 rounded-full text-white"
            >
                <X size={24}/>
            </button>
            
            <div className="space-y-3">
                <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-4">Outras Opções</p>
                
                <Link href="/customers" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 bg-[#0B1120] border border-white/10 p-4 rounded-2xl text-white font-bold hover:border-[#22C55E]">
                    <Users size={20} className="text-blue-400"/> Clientes & Carteira
                </Link>
                <Link href="/dashboard/team" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 bg-[#0B1120] border border-white/10 p-4 rounded-2xl text-white font-bold hover:border-[#22C55E]">
                    <ShieldCheck size={20} className="text-purple-400"/> Minha Equipe
                </Link>
                <Link href="/settings" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 bg-[#0B1120] border border-white/10 p-4 rounded-2xl text-white font-bold hover:border-[#22C55E]">
                    <Settings size={20} className="text-slate-400"/> Configurações
                </Link>
                <button onClick={signOut} className="w-full flex items-center justify-center gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-500 font-bold uppercase mt-4">
                    <LogOut size={20}/> Sair do Sistema
                </button>
            </div>
        </div>
      )}

      {/* BARRA INFERIOR FIXA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0B1120]/90 backdrop-blur-xl border-t border-white/10 px-6 py-3 flex justify-between items-center z-50 pb-safe">
        {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
                <Link 
                    key={item.name} 
                    href={item.href}
                    className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'text-[#22C55E]' : 'text-slate-500'}`}
                >
                    <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-[#22C55E]/10 translate-y-[-2px]' : 'bg-transparent'}`}>
                        {item.icon}
                    </div>
                </Link>
            )
        })}

        {/* BOTÃO MENU (MAIS OPÇÕES) */}
        <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex flex-col items-center gap-1 transition-all ${isMenuOpen ? 'text-white' : 'text-slate-500'}`}
        >
            <div className="p-2">
                <Menu size={20} />
            </div>
        </button>
      </div>
    </>
  );
}