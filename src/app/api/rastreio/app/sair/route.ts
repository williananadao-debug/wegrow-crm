import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, hashToken } from '@/lib/rastreioApp';

export async function POST(req: NextRequest) {
  const c = req.cookies.get(COOKIE_APP)?.value;
  if (c) await supabaseAdmin().from('rastreio_app_sessoes').delete().eq('sessao_hash', hashToken(c));
  const r = NextResponse.json({ ok: true });
  r.cookies.set(COOKIE_APP, '', { path: '/', maxAge: 0 });
  return r;
}
