"use client";
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Radar, LayoutGrid, FileSearch, DollarSign, FileSignature, Bot,
  Grid3x3, LayoutDashboard, HardHat, Activity, Radio, ChevronDown, Car, Percent, Megaphone,
} from 'lucide-react';

// Logo real da empresa (Admin → Logo) igual o resto do sistema já faz — senão cai
// no quadrado com a inicial do nome. Cor do quadrado-fallback segue a vertical:
// dourado (licitação, tema próprio) ou preto (veículos — cor da marca do cliente).
function MarcaEmpresaArgus({ logoUrl, inicial, isVeiculos }: { logoUrl?: string | null; inicial: string; isVeiculos: boolean }) {
  if (logoUrl) {
    return (
      <div className={`bg-white border rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 w-10 h-10 ${isVeiculos ? 'border-[#e0e0e0]' : 'border-[#e5e0d5]'}`}>
        <img src={logoUrl} alt="" className="w-full h-full object-contain p-1" />
      </div>
    );
  }
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isVeiculos ? 'bg-[#171717]' : 'bg-[#241c14]'}`}>
      <Radar size={19} className={isVeiculos ? 'text-white' : 'text-[#d9861c]'} />
    </div>
  );
}

// Argus não usa a navbar padrão (visual próprio de propósito — ver
// src/lib/publicPages.ts). Obras foi trazido pra dentro do Argus de verdade
// (rotas /argus/obras/*, mesmo visual, mesmas tabelas) — não é mais um link
// pra fora, por isso vira aba nativa igual Licitações/Financeiro/Contratos.
// Os módulos que continuam fora (Dashboard geral quando modulos.crm está
// desligado, Pulse, THOR, Max) ficam no dropdown "outros módulos".
export default function ArgusTopNav({ nomeEmpresa }: { nomeEmpresa?: string }) {
  const pathname = usePathname();
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  const modulos = empresa?.modulos || {};
  const [outrosAbertos, setOutrosAbertos] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOutrosAbertos(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, []);

  // Argus nasceu focado em licitação, mas é uma "torre de controle" genérica — a vertical
  // escolhida na ativação do módulo (empresa.modulos.argus_vertical) troca o conjunto de
  // abas E a paleta: licitação é dourado/creme (Foscarini), veículos é cinza claro/preto
  // (GB Motors — preto é a cor da marca do cliente). Mesma estrutura visual nas duas.
  const vertical = modulos.argus_vertical || 'licitacao';
  const isVeiculos = vertical === 'veiculos';

  const itensLicitacao = [
    { href: '/argus', label: 'Painel Geral', icon: LayoutGrid, mostrar: true },
    { href: '/argus/dashboard', label: 'Dashboard', icon: LayoutDashboard, mostrar: modulos.crm !== false },
    { href: '/argus/licitacoes', label: 'Licitações', icon: FileSearch, mostrar: true },
    { href: '/argus/obras', label: 'Obras', icon: HardHat, mostrar: Boolean(modulos.obras) },
    { href: '/argus/financeiro', label: 'Financeiro', icon: DollarSign, mostrar: true },
    { href: '/argus/contratos', label: 'Contratos', icon: FileSignature, mostrar: true },
    { href: '/argus/agente', label: 'Agente IA', icon: Bot, mostrar: true },
  ];

  const itensVeiculos = [
    { href: '/argus', label: 'Painel Geral', icon: LayoutGrid, mostrar: true },
    { href: '/argus/dashboard', label: 'Dashboard', icon: LayoutDashboard, mostrar: modulos.crm !== false },
    { href: '/argus/vendas', label: 'Vendas', icon: Car, mostrar: true },
    { href: '/argus/comissoes', label: 'Comissões', icon: Percent, mostrar: true },
    { href: '/argus/marketing', label: 'Marketing', icon: Megaphone, mostrar: true },
  ];

  const itens = (isVeiculos ? itensVeiculos : itensLicitacao).filter(i => i.mostrar);

  const outrosModulos = [
    { href: '/pulse', label: 'Pulse', icon: Activity, mostrar: Boolean(modulos.pulse) },
    { href: '/thor', label: 'THOR', icon: Bot, mostrar: Boolean(modulos.thor) },
    { href: '/max', label: 'Max', icon: Radio, mostrar: Boolean(modulos.max) },
  ].filter(m => m.mostrar);

  return (
    <nav className={`bg-white border-b sticky top-0 z-30 ${isVeiculos ? 'border-[#e0e0e0]' : 'border-[#e5e0d5]'}`}>
      <div className="max-w-[1400px] mx-auto px-6 h-[72px] flex items-center gap-3">
        <div className="flex items-center gap-3 mr-6 flex-shrink-0">
          <MarcaEmpresaArgus logoUrl={empresa?.logo_url} inicial={(nomeEmpresa || 'A').charAt(0).toUpperCase()} isVeiculos={isVeiculos} />
          <div className="leading-tight">
            <p className={`text-[15px] font-bold ${isVeiculos ? 'text-[#171717]' : 'text-[#241c14]'}`}>{nomeEmpresa || 'Argus'}</p>
            <p className={`text-[13px] font-semibold uppercase tracking-wide ${isVeiculos ? 'text-[#8a8a8a]' : 'text-[#9a958a]'}`} style={{ fontFamily: 'var(--font-argus-serif)' }}>
              Argus · {isVeiculos ? 'Veículos' : 'Licitações'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {itens.map(item => {
            const ativo = item.href === '/argus' ? pathname === '/argus' : pathname.startsWith(item.href);
            const Icon = item.icon;
            const classesAtivo = isVeiculos
              ? (ativo ? 'bg-[#ececec] text-[#171717]' : 'text-[#5c5c5c] hover:bg-[#f5f5f5] hover:text-[#171717]')
              : (ativo ? 'bg-[#fdf0d4] text-[#d9861c]' : 'text-[#6b6862] hover:bg-[#f7f6f3] hover:text-[#241c14]');
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold whitespace-nowrap transition-all ${classesAtivo}`}>
                <Icon size={16} /> {item.label}
              </Link>
            );
          })}
        </div>

        {!isVeiculos && (
          <div className="flex items-center gap-2 bg-[#fdf0d4] border border-[#f0d19a] px-3.5 py-2 rounded-full flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1fa85a] animate-pulse" />
            <span className="text-[13px] font-bold text-[#d9861c] uppercase tracking-wide">PNCP · Sync ativo</span>
          </div>
        )}

        {outrosModulos.length > 0 && (
          <div className="relative flex-shrink-0" ref={ref}>
            <button onClick={() => setOutrosAbertos(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[14px] font-semibold transition-all ${isVeiculos ? 'text-[#5c5c5c] hover:bg-[#f5f5f5] hover:text-[#171717]' : 'text-[#6b6862] hover:bg-[#f7f6f3] hover:text-[#241c14]'}`}>
              <Grid3x3 size={18} /> <ChevronDown size={13} className={`transition-transform ${outrosAbertos ? 'rotate-180' : ''}`} />
            </button>
            {outrosAbertos && (
              <div className={`absolute right-0 top-full mt-2 bg-white border rounded-xl shadow-lg py-1.5 min-w-[200px] z-40 ${isVeiculos ? 'border-[#e0e0e0]' : 'border-[#e5e0d5]'}`}>
                <p className={`text-[12px] font-bold uppercase tracking-wide px-3 py-1.5 ${isVeiculos ? 'text-[#8a8a8a]' : 'text-[#9a958a]'}`}>Outros módulos</p>
                {outrosModulos.map(m => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.href} href={m.href} onClick={() => setOutrosAbertos(false)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-semibold transition-all ${isVeiculos ? 'text-[#171717] hover:bg-[#f5f5f5]' : 'text-[#241c14] hover:bg-[#faf7f2]'}`}>
                      <Icon size={15} className={isVeiculos ? 'text-[#8a8a8a]' : 'text-[#9a958a]'} /> {m.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
