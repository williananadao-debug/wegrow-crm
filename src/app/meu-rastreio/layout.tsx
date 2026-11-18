import type { Metadata, Viewport } from 'next';

// App do cliente final do Rastreio — página pública (login próprio por link de convite),
// instalável no celular (PWA) com manifest próprio, separado do manifest do WeGrow.
export const metadata: Metadata = {
  title: 'Meu rastreamento',
  manifest: '/meu-rastreio/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Rastreamento', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0B1120', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
