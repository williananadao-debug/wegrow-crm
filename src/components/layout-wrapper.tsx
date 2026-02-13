"use client";
// Importações usando o caminho relativo correto para evitar erros no VS Code
import Navbar from './navbar'; 
import Topbar from './topbar'; 
import { usePathname } from 'next/navigation';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1120]">
      {/* MENU LATERAL: No notebook ele é fixo, no celular ele flutua */}
      <aside className="hidden md:block flex-shrink-0 border-r border-white/5">
        <Navbar />
      </aside>

      {/* ÁREA DE CONTEÚDO: Ocupa o resto da tela */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar /> 
        
        {/* main com ajuste de padding para não ficar 'esmagado' nem largo demais */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}