import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

// Manifest do app instalado: leva o nome do instalador (marca dele) quando há sessão.
// Ícone: por enquanto o padrão; ícone com a marca de cada instalador entra com o app nativo.
export async function GET(req: NextRequest) {
  let nome = 'Meu rastreamento';
  try {
    const db = supabaseAdmin();
    const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
    if (s) {
      const { data } = await db.from('empresas').select('nome').eq('id', s.empresaId).maybeSingle();
      if (data?.nome) nome = `${data.nome} Rastreamento`;
    }
  } catch { /* sem sessão: nome padrão */ }
  return NextResponse.json({
    id: '/meu-rastreio',
    name: nome,
    short_name: nome.length > 12 ? 'Rastreio' : nome,
    start_url: '/meu-rastreio',
    scope: '/meu-rastreio',
    display: 'standalone',
    background_color: '#0B1120',
    theme_color: '#0B1120',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } });
}
