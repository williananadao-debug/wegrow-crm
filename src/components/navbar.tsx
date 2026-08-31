"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Target, Zap, Settings, LogOut, ShieldCheck,
  Users, Briefcase, ChevronLeft, ChevronRight,
  Rocket, BarChart3, Menu, X, UsersRound, Brain, LayoutGrid, ChevronDown, Activity, ShoppingBag, Boxes, Bot, Radio, HardHat, Radar, Megaphone, Scale, TrendingUp
} from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { supabase } from '@/lib/supabase';

// Logo real da empresa quando configurado (Admin → Logo); senão cai no quadrado
// verde com a inicial do nome, igual sempre foi.
function MarcaEmpresa({ logoUrl, inicial, size }: { logoUrl?: string | null; inicial: string; size: number }) {
  if (logoUrl) {
    return (
      <div className="bg-white rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ width: size, height: size }}>
        <img src={logoUrl} alt="" className="w-full h-full object-contain p-1" />
      </div>
    );
  }
  return (
    <div className="bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] flex-shrink-0" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {inicial}
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  
  // 👇 A TRAVA DE INVISIBILIDADE DO SITE 👇
  const rotasSemMenu = ['/', '/login'];
  if (rotasSemMenu.includes(pathname)) {
    return null; 
  }
  
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const signOut = auth.signOut || (() => {});

  // MENU NASCE FECHADO POR PADRÃO
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // Grupos do menu (CRM / Nexus) nascem abertos — fecha só quem clica explicitamente.
  const [gruposFechados, setGruposFechados] = useState<Record<string, boolean>>({});
  const toggleGrupo = (key: string) => setGruposFechados(prev => ({ ...prev, [key]: !prev[key] }));

  const isDirector = perfil?.cargo === 'diretor';
  const isManager = perfil?.cargo === 'gerente';
  const modulos = empresa?.modulos || {};

  const isCDL = Boolean(modulos.cdl);
  const mostrarIA = Boolean(modulos.ia);
  const opecHabilitado = Boolean(modulos.opec);
  const mostrarNexus = Boolean(modulos.nexus);
  const mostrarPulse = Boolean(modulos.pulse);
  const mostrarThor = Boolean(modulos.thor);
  const mostrarMax = Boolean(modulos.max);
  const mostrarObras = Boolean(modulos.obras);
  const mostrarArgus = Boolean(modulos.argus);
  const mostrarRedesSociais = Boolean(modulos.redes_sociais);
  // Temporário — restrito a diretor enquanto o módulo está em teste (18/08).
  const mostrarMidia = Boolean(modulos.midia) && isDirector;
  const mostrarAdvocacia = Boolean(modulos.advocacia);
  // Macro do produto de pipeline/vendas. Ausente no JSON conta como ligado — empresas
  // criadas antes desse flag existir não podem perder o menu inteiro só por não ter a chave.
  const mostrarCRM = modulos.crm !== false;

  // Marca no menu é por tenant, não fixa "WeGrow" — cada empresa vê o próprio nome aqui,
  // WeGrow é só o fornecedor por trás.
  const nomeMarca = empresa?.nome || 'WeGrow';
  const inicialMarca = nomeMarca.charAt(0).toUpperCase();

  // O menu "Produção" só aparece quando existe algum job em andamento no Kanban visível
  // (roteiro/gravação/edição/aprovação). Jobs de contrato assinado pulam direto pra
  // "entregue" (a OPEC puxa via API, sem etapa manual) e ficam ocultos por padrão na
  // Esteira, então não contam aqui — só jobs manuais ainda em produção acendem o menu.
  const ESTAGIOS_VISIVEIS = ['roteiro', 'gravacao', 'edicao', 'aprovacao'];
  const [temJobLiberado, setTemJobLiberado] = useState(false);
  useEffect(() => {
    if (!opecHabilitado || !empresa?.id) { setTemJobLiberado(false); return; }
    let ativo = true;
    supabase.from('jobs').select('id').eq('empresa_id', empresa.id).in('stage', ESTAGIOS_VISIVEIS).limit(1)
      .then(({ data }) => { if (ativo) setTemJobLiberado(Boolean(data && data.length > 0)); });
    return () => { ativo = false; };
  }, [opecHabilitado, empresa?.id]);

  const mostrarOpec = opecHabilitado && temJobLiberado;

  // Menu vira dois grupos macro (CRM / Nexus) — "Clientes" fica fora dos dois, é a base
  // compartilhada entre ambos (o Nexus pendura os arquivos no mesmo cadastro de cliente).
  const crmItems: any[] = [
      { name: 'Dashboard',  icon: <LayoutDashboard size={20} />, href: '/dashboard' },
      isDirector && mostrarIA ? { name: 'Estratégia', icon: <Rocket size={20} />, href: '/dashboard/premises' } : null,
      (isDirector || isManager) ? { name: 'Relatórios', icon: <BarChart3 size={20} />, href: '/reports' } : null,
      { name: 'Metas',      icon: <Target size={20} />,          href: '/goals' },
      { name: isCDL ? 'Prospecção' : 'Vendas', icon: <Zap size={20} />, href: '/deals' },
      mostrarOpec ? { name: 'Produção',   icon: <Briefcase size={20} />,  href: '/jobs' }     : null,
      isCDL ? { name: 'Base CDL', icon: <UsersRound size={20} />, href: '/associados' } : null,
      (isDirector || isManager) ? { name: 'Minha Equipe', icon: <ShieldCheck size={20} />, href: '/dashboard/team' } : null,
  ].filter(Boolean) as any[];

  const nexusItems: any[] = [
      { name: 'Nexus', icon: <Brain size={20} />, href: '/nexus' },
  ];

  const pulseItems: any[] = [
      { name: 'Painel', icon: <LayoutGrid size={20} />, href: '/pulse' },
      { name: 'Nova Venda', icon: <ShoppingBag size={20} />, href: '/pulse/nova-venda' },
      { name: 'Estoque', icon: <Boxes size={20} />, href: '/pulse/estoque' },
  ];

  const clientesItem = { name: isCDL ? 'Associados' : 'Clientes', icon: <Users size={20} />, href: '/customers' };
  const thorItem = { name: 'THOR', icon: <Bot size={20} />, href: '/thor' };
  const maxItem = { name: 'Max', icon: <Radio size={20} />, href: '/max' };
  const obrasItem = { name: 'Obras', icon: <HardHat size={20} />, href: '/obras' };
  const argusItem = { name: 'Argus', icon: <Radar size={20} />, href: '/argus' };
  const midiaItem = { name: 'Demais FM Comercial', icon: <Megaphone size={20} />, href: '/midia' };
  const redesSociaisItem = { name: 'Redes Sociais', icon: <TrendingUp size={20} />, href: '/marketing' };
  const advocaciaItem = { name: 'Advocacia', icon: <Scale size={20} />, href: '/advocacia' };

  const grupos: { key: string; label: string; icon: any; items: any[] }[] = [
      mostrarCRM         ? { key: 'crm',   label: 'CRM',           icon: <LayoutGrid size={16} />,   items: crmItems }        : null,
      mostrarNexus       ? { key: 'nexus', label: 'Nexus',         icon: <Brain size={16} />,        items: nexusItems }      : null,
      mostrarPulse ? { key: 'pulse', label: 'Pulse', icon: <Activity size={16} />, items: pulseItems } : null,
  ].filter(Boolean) as any[];

  // Usado só no rail colapsado (ícone-only) — ali não cabe cabeçalho de grupo, então achata tudo.
  const flatItems: any[] = [
      ...(mostrarCRM ? crmItems : []),
      clientesItem,
      ...(mostrarNexus ? nexusItems : []),
      ...(mostrarPulse ? pulseItems : []),
      ...(mostrarThor ? [thorItem] : []),
      ...(mostrarMax ? [maxItem] : []),
      ...(mostrarObras ? [obrasItem] : []),
      ...(mostrarArgus ? [argusItem] : []),
      ...(mostrarRedesSociais ? [redesSociaisItem] : []),
      ...(mostrarMidia ? [midiaItem] : []),
      ...(mostrarAdvocacia ? [advocaciaItem] : []),
  ];

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#0B1120]/95 backdrop-blur-md border-b border-white/10 z-[60] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsMobileOpen(true)} className="p-1 text-slate-400 hover:text-white transition-colors">
            <Menu size={26} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <MarcaEmpresa logoUrl={empresa?.logo_url} inicial={inicialMarca} size={32} />
            <span className="text-lg font-black italic text-white tracking-tighter truncate">{nomeMarca.toUpperCase()}</span>
          </div>
        </div>
        <NotificationBell />
      </div>

      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] md:hidden" onClick={() => setIsMobileOpen(false)} />
      )}
      
      <aside className={`fixed top-0 left-0 bottom-0 w-[280px] bg-[#0B1120] border-r border-white/10 z-[80] md:hidden transition-transform duration-300 flex flex-col py-6 px-6 shadow-2xl ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3 text-white min-w-0">
              <MarcaEmpresa logoUrl={empresa?.logo_url} inicial={inicialMarca} size={40} />
              <div className="flex flex-col leading-none min-w-0">
                <span className="font-bold text-lg tracking-tighter uppercase italic truncate">{nomeMarca}</span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">{perfil?.cargo || 'Membro'}</span>
              </div>
            </div>
            <button onClick={() => setIsMobileOpen(false)} className="text-slate-500 hover:text-white bg-white/5 p-2 rounded-full"><X size={18}/></button>
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto custom-scrollbar">
          {mostrarCRM && (() => {
            const g = grupos.find(x => x.key === 'crm')!;
            const aberto = gruposFechados.crm !== true;
            return (
              <div className="mb-1">
                <button onClick={() => toggleGrupo('crm')} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 transition-all">
                  <span className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">{g.icon} CRM</span>
                  <ChevronDown size={14} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
                </button>
                {aberto && (
                  <div className="flex flex-col gap-1 pl-3 ml-5 border-l border-white/10 mt-1">
                    {crmItems.map((item: any) => (
                      <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        {item.icon} {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <Link href={clientesItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname === clientesItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            {clientesItem.icon} {clientesItem.name}
          </Link>

          {mostrarNexus && (() => {
            const g = grupos.find(x => x.key === 'nexus')!;
            const aberto = gruposFechados.nexus !== true;
            return (
              <div className="mb-1">
                <button onClick={() => toggleGrupo('nexus')} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 transition-all">
                  <span className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">{g.icon} Nexus</span>
                  <ChevronDown size={14} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
                </button>
                {aberto && (
                  <div className="flex flex-col gap-1 pl-3 ml-5 border-l border-white/10 mt-1">
                    {nexusItems.map((item: any) => (
                      <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        {item.icon} {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {mostrarPulse && (() => {
            const g = grupos.find(x => x.key === 'pulse')!;
            const aberto = gruposFechados.pulse !== true;
            return (
              <div className="mb-1">
                <button onClick={() => toggleGrupo('pulse')} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 transition-all">
                  <span className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">{g.icon} Pulse</span>
                  <ChevronDown size={14} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
                </button>
                {aberto && (
                  <div className="flex flex-col gap-1 pl-3 ml-5 border-l border-white/10 mt-1">
                    {pulseItems.map((item: any) => (
                      <Link key={item.name} href={item.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        {item.icon} {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {mostrarThor && (
            <Link href={thorItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname === thorItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {thorItem.icon} {thorItem.name}
            </Link>
          )}

          {mostrarMax && (
            <Link href={maxItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname === maxItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {maxItem.icon} {maxItem.name}
            </Link>
          )}

          {mostrarObras && (
            <Link href={obrasItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname === obrasItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {obrasItem.icon} {obrasItem.name}
            </Link>
          )}

          {mostrarArgus && (
            <Link href={argusItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname.startsWith(argusItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {argusItem.icon} {argusItem.name}
            </Link>
          )}

          {mostrarRedesSociais && (
            <Link href={redesSociaisItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname.startsWith(redesSociaisItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {redesSociaisItem.icon} {redesSociaisItem.name}
            </Link>
          )}

          {mostrarMidia && (
            <Link href={midiaItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname.startsWith(midiaItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {midiaItem.icon} {midiaItem.name}
            </Link>
          )}

          {mostrarAdvocacia && (
            <Link href={advocaciaItem.href} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm mb-1 ${pathname.startsWith(advocaciaItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              {advocaciaItem.icon} {advocaciaItem.name}
            </Link>
          )}

          <div className="mt-auto pt-4 border-t border-white/5 space-y-2">
            {isDirector && (
              <Link href="/settings" onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm ${pathname === '/settings' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <Settings size={20} /> Configurações
              </Link>
            )}
            <button onClick={() => { setIsMobileOpen(false); signOut(); }} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm text-red-500 hover:bg-red-500/10">
              <LogOut size={20} /> Sair
            </button>
          </div>
        </nav>
      </aside>

      {/* 👇 MENU DESKTOP Z-INDEX ALTO 👇 */}
      <aside className={`hidden md:flex flex-col h-screen sticky top-0 bg-[#0B1120] border-r border-white/5 transition-all duration-300 z-[90] ${isCollapsed ? 'w-[80px]' : 'w-[260px]'}`}>
        <button onClick={toggleSidebar} className="absolute -right-3 top-9 bg-[#22C55E] text-[#0F172A] p-1 rounded-full hover:scale-110 transition-transform shadow-[0_0_15px_rgba(34,197,94,0.4)] z-[100] flex items-center justify-center">
          {isCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
        </button>

        {/* 👇 AQUI FOI REMOVIDA A "JAULA" (overflow-hidden) 👇 */}
        <div className={`flex flex-col h-full ${isCollapsed ? 'px-4' : 'px-6'} py-6 relative`}>
            <div className={`flex items-center gap-3 mb-10 text-white transition-all ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="min-w-[40px]"><MarcaEmpresa logoUrl={empresa?.logo_url} inicial={inicialMarca} size={40} /></div>
              <div className={`flex flex-col overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                <span className="font-bold text-lg tracking-tighter uppercase italic leading-none truncate">{nomeMarca}</span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">{perfil?.cargo || 'Visitante'}</span>
              </div>
            </div>

            <nav className="flex flex-col gap-2 flex-1">
              {isCollapsed ? (
                flatItems.map((item) => (
                  <Link key={item.name} href={item.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all group relative justify-center ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    <div className="min-w-[20px]">{item.icon}</div>
                    <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#1E293B] text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[999] border border-white/10 translate-x-2 group-hover:translate-x-0">
                      {item.name}
                    </div>
                  </Link>
                ))
              ) : (
                <>
                  {mostrarCRM && (() => {
                    const g = grupos.find(x => x.key === 'crm')!;
                    const aberto = gruposFechados.crm !== true;
                    return (
                      <div className="mb-1">
                        <button onClick={() => toggleGrupo('crm')} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 transition-all">
                          <span className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">{g.icon} CRM</span>
                          <ChevronDown size={14} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
                        </button>
                        {aberto && (
                          <div className="flex flex-col gap-1 pl-2 ml-3 border-l border-white/10 mt-1">
                            {crmItems.map((item: any) => (
                              <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-semibold ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                <div className="min-w-[18px]">{item.icon}</div> {item.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <Link href={clientesItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname === clientesItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    <div className="min-w-[20px]">{clientesItem.icon}</div>
                    <span className="text-sm font-semibold">{clientesItem.name}</span>
                  </Link>

                  {mostrarNexus && (() => {
                    const g = grupos.find(x => x.key === 'nexus')!;
                    const aberto = gruposFechados.nexus !== true;
                    return (
                      <div className="mb-1">
                        <button onClick={() => toggleGrupo('nexus')} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 transition-all">
                          <span className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">{g.icon} Nexus</span>
                          <ChevronDown size={14} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
                        </button>
                        {aberto && (
                          <div className="flex flex-col gap-1 pl-2 ml-3 border-l border-white/10 mt-1">
                            {nexusItems.map((item: any) => (
                              <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-semibold ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                <div className="min-w-[18px]">{item.icon}</div> {item.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {mostrarPulse && (() => {
                    const g = grupos.find(x => x.key === 'pulse')!;
                    const aberto = gruposFechados.pulse !== true;
                    return (
                      <div className="mb-1">
                        <button onClick={() => toggleGrupo('pulse')} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 transition-all">
                          <span className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">{g.icon} Pulse</span>
                          <ChevronDown size={14} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
                        </button>
                        {aberto && (
                          <div className="flex flex-col gap-1 pl-2 ml-3 border-l border-white/10 mt-1">
                            {pulseItems.map((item: any) => (
                              <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-semibold ${pathname === item.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                <div className="min-w-[18px]">{item.icon}</div> {item.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {mostrarThor && (
                    <Link href={thorItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname === thorItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <div className="min-w-[20px]">{thorItem.icon}</div>
                      <span className="text-sm font-semibold">{thorItem.name}</span>
                    </Link>
                  )}

                  {mostrarMax && (
                    <Link href={maxItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname === maxItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <div className="min-w-[20px]">{maxItem.icon}</div>
                      <span className="text-sm font-semibold">{maxItem.name}</span>
                    </Link>
                  )}

                  {mostrarObras && (
                    <Link href={obrasItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname === obrasItem.href ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <div className="min-w-[20px]">{obrasItem.icon}</div>
                      <span className="text-sm font-semibold">{obrasItem.name}</span>
                    </Link>
                  )}

                  {mostrarArgus && (
                    <Link href={argusItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname.startsWith(argusItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <div className="min-w-[20px]">{argusItem.icon}</div>
                      <span className="text-sm font-semibold">{argusItem.name}</span>
                    </Link>
                  )}

                  {mostrarRedesSociais && (
                    <Link href={redesSociaisItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname.startsWith(redesSociaisItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <div className="min-w-[20px]">{redesSociaisItem.icon}</div>
                      <span className="text-sm font-semibold">{redesSociaisItem.name}</span>
                    </Link>
                  )}

                  {mostrarMidia && (
                    <Link href={midiaItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname.startsWith(midiaItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <div className="min-w-[20px]">{midiaItem.icon}</div>
                      <span className="text-sm font-semibold">{midiaItem.name}</span>
                    </Link>
                  )}

                  {mostrarAdvocacia && (
                    <Link href={advocaciaItem.href} className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all mb-1 ${pathname.startsWith(advocaciaItem.href) ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <div className="min-w-[20px]">{advocaciaItem.icon}</div>
                      <span className="text-sm font-semibold">{advocaciaItem.name}</span>
                    </Link>
                  )}
                </>
              )}
            </nav>

            <div className="pt-4 border-t border-white/5 space-y-2 mt-2">
              {isDirector && (
                <Link href="/settings" className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all group relative ${pathname === '/settings' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'text-slate-400 hover:text-white hover:bg-white/5'} ${isCollapsed ? 'justify-center' : ''}`}>
                  <Settings size={20} />
                  <span className={`text-sm font-semibold whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Configurações</span>
                  {isCollapsed && (
                      <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#1E293B] text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[999] border border-white/10 translate-x-2 group-hover:translate-x-0">
                          CONFIGURAÇÕES
                      </div>
                  )}
                </Link>
              )}
              <button onClick={signOut} className={`w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-all text-red-500 hover:bg-red-500/10 cursor-pointer group relative ${isCollapsed ? 'justify-center' : ''}`}>
                <LogOut size={20} />
                <span className={`text-sm font-semibold whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Sair</span>
                {isCollapsed && (
                    <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#1E293B] text-white text-[10px] font-bold uppercase rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[999] border border-white/10 translate-x-2 group-hover:translate-x-0">
                        SAIR
                    </div>
                )}
              </button>
            </div>
        </div>
      </aside>
    </>
  );
}