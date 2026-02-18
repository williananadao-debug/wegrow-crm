import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from '@/lib/contexts/AuthContext';
import LayoutWrapper from '@/components/layout-wrapper'; 

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#0B1120",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "WeGrow CRM",
  description: "Gestão Comercial e Produção",
  manifest: "/manifest.json",
  
  // --- AQUI ESTÁ A MÁGICA DO LOGO ---
  // Certifique-se de ter um arquivo 'logo.png' na pasta 'public'
  icons: {
    icon: '/logo.png',      // Ícone da aba do navegador
    shortcut: '/logo.png',  // Ícone de atalho
    apple: '/logo.png',     // Ícone para iPhone/iPad (Apple Touch Icon)
  },
  
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WeGrow",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <body className={`${inter.className} bg-[#0B1120] text-white antialiased`}>
        <AuthProvider>
          {/* O LayoutWrapper contém a lógica do App (Sidebar, Topbar, Mobile) */}
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}