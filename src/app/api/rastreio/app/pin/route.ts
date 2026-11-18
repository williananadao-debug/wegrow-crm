import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, hashPin, conferePin, pinValido } from '@/lib/rastreioApp';

// Cria (primeira vez) ou troca (com o PIN atual) o PIN de bloqueio do cliente.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const { pin, pinAtual } = await req.json().catch(() => ({}));
  if (!pinValido(pin)) return NextResponse.json({ error: 'O PIN deve ter de 4 a 6 números.' }, { status: 400 });
  const { data: c } = await db.from('rastreio_clientes').select('app_pin_hash').eq('id', s.clienteId).maybeSingle();
  if (c?.app_pin_hash && !conferePin(String(pinAtual || ''), c.app_pin_hash)) {
    return NextResponse.json({ error: 'PIN atual incorreto. Se esqueceu, peça para a central zerar.' }, { status: 403 });
  }
  await db.from('rastreio_clientes').update({ app_pin_hash: hashPin(pin) }).eq('id', s.clienteId);
  return NextResponse.json({ ok: true });
}
