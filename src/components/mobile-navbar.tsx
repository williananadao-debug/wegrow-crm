"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Target, 
  Briefcase, 
  DollarSign, 
  Menu 
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function MobileNavbar() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { name: 'Dash', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Vendas', href: '/deals', icon: <Target size={20} /> },
    { name: 'Jobs', href: '/jobs', icon: <Briefcase size={20} /> }, // O botão de ação central
    { name: 'Caixa', href: '/finance', icon: <DollarSign size={20} /> },
  ];

  if (pathname === '/login') return null;

  return (
    <>
      {/* MENU FLUTUANTE (QUANDO CLICA NO ÍCONE DE MENU) */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col justify-end pb-24 px-6 animate-in slide-in-from-bottom-10">
            <button onClick={() => setIsMenuOpen(false)} className="absolute top-6 right-6 text-slate-500"><Menu size={24}/></button>
            <div className="space-y-4">
                <Link href="/customers" onClick={() => setIsMenuOpen(false)} className="block bg-[#0B1120] border border-white/10 p-4 rounded-2xl text-white font-black uppercase text-center">
                    Clientes & Carteira
                </Link>
                <Link href="/dashboard/team" onClick={() => setIsMenuOpen(false)} className="block bg-[#0B1120] border border-white/10 p-4 rounded-2xl text-white font-black uppercase text-center">
                    Minha Equipe
                </Link>
                <Link href="/settings" onClick={() => setIsMenuOpen(false)} className="block bg-[#0B1120] border border-white/10 p-4 rounded-2xl text-white font-black uppercase text-center">
                    Configurações
                </Link>
                <button onClick={signOut} className="w-full bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-500 font-black uppercase text-center">
                    Sair do Sistema
                </button>
            </div>
        </div>
      )}

      {/* BARRA INFERIOR FIXA */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0B1120]/90 backdrop-blur-xl border-t border-white/10 px-6 py-4 flex justify-between items-center z-40 md:hidden pb-safe">
        
        {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
                <Link 
                    key={item.name} 
                    href={item.href}
                    className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'text-[#22C55E]' : 'text-slate-500'}`}
                >
                    <div className={`p-2 rounded-xl ${isActive ? 'bg-[#22C55E]/10' : 'bg-transparent'}`}>
                        {item.icon}
                    </div>
                    {/* <span className="text-[9px] font-bold uppercase tracking-wide">{item.name}</span> */} 
                    {/* Ocultando texto para ficar mais clean, estilo app moderno */}
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