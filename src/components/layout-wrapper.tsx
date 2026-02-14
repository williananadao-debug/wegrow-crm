"use client";
import Navbar from './navbar'; 
import Topbar from './topbar'; 
import { usePathname } from 'next/navigation';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1120]">
      {/* CORREÇÃO: Removemos a tag <aside hidden...> 
          Agora a Navbar é quem decide se aparece fixa (mobile) ou relativa (desktop) */}
      <Navbar />

      {/* ÁREA DE CONTEÚDO */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar /> 
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}