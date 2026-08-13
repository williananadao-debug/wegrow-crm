"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Megaphone, Settings, LayoutGrid, Radio, Gift, Cake } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

const ABAS = [
  { href: '/midia', label: 'Visão Geral', icon: LayoutGrid },
  { href: '/midia/emissoras', label: 'Emissoras', icon: Radio },
  { href: '/midia/promocoes', label: 'Promoções', icon: Gift },
  { href: '/midia/aniversarios', label: 'Aniversários', icon: Cake },
];

export default function MidiaTabs() {
  const pathname = usePathname();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
          <Megaphone size={28} className="text-pink-500" /> Mídia
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Prestação de contas — audiência e redes sociais</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="bg-[#0F172A] border border-white/10 p-1 rounded-xl flex gap-1 flex-wrap">
          {ABAS.map(aba => {
            const ativo = aba.href === '/midia' ? pathname === '/midia' : pathname.startsWith(aba.href);
            const Icon = aba.icon;
            return (
              <Link key={aba.href} href={aba.href} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${ativo ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                <Icon size={12} /> {aba.label}
              </Link>
            );
          })}
        </div>
        {isLideranca && (
          <Link href="/midia/configuracoes" className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 transition-colors" title="Configurações">
            <Settings size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
