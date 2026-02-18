"use client";

import { usePathname } from 'next/navigation';

// --- SEUS IMPORTS (Respeitando os nomes dos arquivos que você tem) ---
import Navbar from '@/components/navbar';           // Sidebar Desktop
import Topbar from '@/components/topbar';           // Topbar Desktop
import MobileNavbar from '@/components/mobile-navbar'; // Menu Inferior Mobile
import MobileHeader from '@/components/MobileHeader';  // Topo Mobile (Maiúsculo conforme sua pasta)

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  // Se for login, retorna limpo sem barras
  if (isLoginPage) return <>{children}</>;

  return (
    <div className="flex h-screen bg-[#0B1120] overflow-hidden">
      
      {/* --- MOBILE: Topo (Logo + Sino) --- */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50">
        <MobileHeader />
      </div>

      {/* --- DESKTOP: Sidebar Lateral --- */}
      {/* Z-Index alto para garantir que a sidebar fique sobreposta se necessário */}
      <div className="hidden md:flex h-full z-40 relative">
        <Navbar />
      </div>

      {/* --- ÁREA DE CONTEÚDO PRINCIPAL --- */}
      {/* FIX DO BOTÃO: Adicionei 'md:pl-5' aqui.
          Isso empurra o Topbar e o conteúdo um pouco para a direita,
          deixando espaço para o botão verde da sidebar não ficar em cima de nada.
      */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative md:pl-5">
        
        {/* DESKTOP: Cabeçalho Profissional */}
        <div className="hidden md:block">
           <Topbar /> 
        </div>
        
        {/* MAIN SCROLLABLE */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#0B1120] w-full h-full">
          {/* PADDING INTELIGENTE:
             Mobile: pt-20 (espaço p/ header) e pb-24 (espaço p/ menu inferior)
             Desktop: p-6 ou p-8 normal
          */}
          <div className="pt-20 pb-24 px-4 md:pt-6 md:pb-6 md:px-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* --- MOBILE: Menu Inferior --- */}
      <div className="md:hidden">
         <MobileNavbar />
      </div>

    </div>
  );
}