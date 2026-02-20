"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/navbar';           
import Topbar from '@/components/topbar';           

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Páginas que NÃO devem ter o menu lateral
  const isPublicPage = pathname === '/login' || pathname === '/portal' || pathname === '/solicitar';

  if (isPublicPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-[#0B1120] overflow-hidden text-white">
      <Navbar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative md:pl-5">
        <Topbar /> 
        <main className="flex-1 overflow-y-auto bg-[#0B1120] w-full h-full">
          <div className="pt-20 pb-8 px-4 md:pt-6 md:pb-6 md:px-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}