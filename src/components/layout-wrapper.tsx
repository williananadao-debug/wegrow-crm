"use client";

import { usePathname } from 'next/navigation';

// --- IMPORTS EXATOS CONFORME SUA IMAGEM ---
import Navbar from '@/components/navbar';           // Arquivo está minúsculo
import Topbar from '@/components/topbar';           // Arquivo está minúsculo
import MobileNavbar from '@/components/mobile-navbar'; // Arquivo está minúsculo

// O ERRO ESTAVA AQUI: O arquivo no seu computador começa com letra Maiúscula
import MobileHeader from '@/components/MobileHeader'; 

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) return <>{children}</>;

  return (
    <div className="flex h-screen bg-[#0B1120] overflow-hidden">
      
      {/* MOBILE: Topo */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50">
        <MobileHeader />
      </div>

      {/* DESKTOP: Sidebar */}
      <div className="hidden md:flex h-full">
        <Navbar />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* DESKTOP: Cabeçalho */}
        <div className="hidden md:block">
           <Topbar /> 
        </div>
        
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#0B1120] w-full h-full">
          <div className="pt-20 pb-24 px-4 md:pt-6 md:pb-6 md:px-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* MOBILE: Menu Inferior */}
      <div className="md:hidden">
         <MobileNavbar />
      </div>
    </div>
  );
}