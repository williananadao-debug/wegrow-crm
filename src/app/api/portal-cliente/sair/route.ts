import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_SESSAO, dbAdmin, hashToken } from '@/lib/portal-cliente';

export const dynamic = 'force-dynamic';

export async function POST() {
  const valor = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (valor) await dbAdmin().from('portal_cliente_sessoes').delete().eq('sessao_hash', hashToken(valor));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
