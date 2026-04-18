import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; 
import { AuthProvider } from '@/lib/contexts/AuthContext';
import LayoutWrapper from '../components/layout-wrapper'; 

// 👇 AS DUAS ANTENAS DO VERCEL (Analytics e Speed Insights)
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

// 🟢 1. IMPORTANDO A FERRAMENTA DE SCRIPT DO NEXT.JS
import Script from 'next/script';

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
  icons: {
    icon: '/logo.png',      
    shortcut: '/logo.png',  
    apple: '/logo.png',     
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
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </AuthProvider>
        
        {/* 👇 RASTREADOR DE VISITANTES */}
        <Analytics />
        
        {/* 👇 RASTREADOR DE VELOCIDADE E PERFORMANCE */}
        <SpeedInsights />
        
        {/* Chat Brevo */}
        <Script id="brevo-chat-init" strategy="beforeInteractive">
          {`window.BrevoConversationsID = '69c29c5c62301a763e028155';`}
        </Script>
        <Script
          src="https://conversations-widget.brevo.com/brevo-conversations.js"
          strategy="afterInteractive"
        />
        
      </body>
    </html>
  );
}