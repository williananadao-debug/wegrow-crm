"use client";

import React, { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import Navbar from '@/components/navbar';
import Topbar from '@/components/topbar';
import { isPublicPage } from '@/lib/publicPages';

const OnboardingTour = dynamic(() => import('@/components/OnboardingTour'), { ssr: false });
const GlobalSearch = dynamic(() => import('@/components/GlobalSearch'), { ssr: false });

interface LayoutWrapperProps {
  children: ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();

  if (isPublicPage(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-[#0B1120] overflow-hidden text-white">
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
          <div className="pt-20 pb-8 px-4 md:pt-6 md:pb-6 md:px-8 max-w-[1600px] mx-auto w-full h-full">
            {children}
          </div>
        </main>
        <OnboardingTour />
        <GlobalSearch />
      </div>
    </div>
  );
}