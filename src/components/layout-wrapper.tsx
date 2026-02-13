"use client";
import Navbar from './navbar'; 
import Topbar from './topbar'; 
import { usePathname } from 'next/navigation';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Lista de páginas que NÃO devem ter menu (Login, Cadastro, etc.)
  const noMenuPages = ['/login', '/register'];
  const isNoMenuPage = noMenuPages.includes(pathname);

  if (isNoMenuPage) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1120]">
      {/* Menu Lateral */}
      <Navbar />

      {/* Área da Direita */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar /> 
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}