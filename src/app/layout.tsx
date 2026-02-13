"use client";
import { usePathname } from 'next/navigation';
// Usando o @/ para o Next.js achar a pasta components não importa onde ele esteja
import Navbar from '@/components/navbar';
import Topbar from '@/components/topbar';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Se for a tela de login, não mostra os menus
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1120]">
      {/* Menu Lateral - Visível apenas no computador (lg) */}
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-800">
        <Navbar />
      </aside>

      {/* Área da Direita - Topbar + Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar text-white">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}