import { NextResponse } from 'next/server';
import { COOKIE_SESSAO, SESSAO_DIAS, criarSessao, dbAdmin, hashToken } from '@/lib/portal-cliente';

export const dynamic = 'force-dynamic';

// Troca o link do e-mail por uma sessão. É POST (botão "Entrar" na página /acompanhar/entrar)
// e não GET direto no link: antivírus de e-mail (Outlook, Gmail) abrem os links sozinhos pra
// checar, e com GET isso "gastaria" o link de uso único antes do cliente clicar.
export async function POST(req: Request) {
  let token = '';
  try { token = String((await req.json())?.token || ''); } catch { /* corpo inválido */ }
  if (!token) return NextResponse.json({ erro: 'Link inválido.' }, { status: 400 });

  const db = dbAdmin();
  const { data: t } = await db.from('portal_cliente_tokens')
    .select('id, empresa_id, cliente_id, email, expira_em, usado_em')
    .eq('token_hash', hashToken(token)).maybeSingle();
  if (!t || t.usado_em || new Date(t.expira_em).getTime() < Date.now()) {
    return NextResponse.json({ erro: 'Este link expirou ou já foi usado. Peça um novo com o seu e-mail.' }, { status: 410 });
  }

  // Marca como usado só se ainda não estava (evita duas sessões com o mesmo link em paralelo).
  const { data: marcado } = await db.from('portal_cliente_tokens')
    .update({ usado_em: new Date().toISOString() }).eq('id', t.id).is('usado_em', null).select('id').maybeSingle();
  if (!marcado) return NextResponse.json({ erro: 'Este link já foi usado. Peça um novo com o seu e-mail.' }, { status: 410 });

  const { valor } = await criarSessao(db, { empresa_id: t.empresa_id, cliente_id: t.cliente_id, email: t.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, valor, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSAO_DIAS * 86400,
  });
  return res;
}
