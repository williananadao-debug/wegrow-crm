import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from '@/lib/contexts/AuthContext';
// CORREÇÃO: Importando com o nome exato do arquivo (tudo minúsculo)
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
      <body className={`${inter.className} bg-[#0B1120] text-white`}>
        <AuthProvider>
          {/* Envolvemos o children com o LayoutWrapper para o menu aparecer */}
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}