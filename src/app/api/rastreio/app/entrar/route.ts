import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { trocarConvite, COOKIE_APP, opcoesCookie } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  const sessao = await trocarConvite(supabaseAdmin(), String(token || ''), req.headers.get('user-agent') || undefined);
  if (!sessao) return NextResponse.json({ error: 'Link inválido, já usado ou vencido. Peça um novo para a sua central de rastreamento.' }, { status: 400 });
  const r = NextResponse.json({ ok: true });
  r.cookies.set(COOKIE_APP, sessao, opcoesCookie());
  return r;
}
