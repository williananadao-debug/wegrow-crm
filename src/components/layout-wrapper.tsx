"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/navbar';           
import Topbar from '@/components/topbar';           

// 👇 ESSA LINHA ABAIXO É O QUE MATA O ERRO VERMELHO E TRAZ A BELEZA DE VOLTA
export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Liberamos o login e o portal para não terem menu lateral
  const isPublicPage = pathname === '/login' || pathname === '/portal';

  if (isPublicPage) return <>{children}</>;

  return (
    <div className="flex h-screen bg-[#0B1120] overflow-hidden">
      {/* Menu Lateral */}
      <div className="z-40 relative">
        <Navbar />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative md:pl-5">
        {/* Barra Superior Desktop */}
        <div className="hidden md:block">
           <Topbar /> 
        </div>
        
        {/* Conteúdo da Página */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#0B1120] w-full h-full">
          <div className="pt-20 pb-8 px-4 md:pt-6 md:pb-6 md:px-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}