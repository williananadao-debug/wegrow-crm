"use client";
import { usePathname } from "next/navigation";
import Navbar from "@/components/navbar";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Verifica se a página atual é a de Login
  const isLoginPage = pathname === "/login";

  // SE FOR LOGIN: Retorna apenas o conteúdo (tela cheia), sem barra lateral
  if (isLoginPage) {
    return <div className="h-full w-full">{children}</div>;
  }

  // SE NÃO FOR LOGIN (Dashboard, Vendas, etc): Retorna com a Navbar
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="h-full flex-shrink-0">
        <Navbar />
      </aside>
      <main className="flex-1 h-full overflow-y-auto bg-transparent">
        <div className="p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}