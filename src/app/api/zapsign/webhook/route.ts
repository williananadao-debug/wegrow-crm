import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  console.log('[zapsign/webhook]', JSON.stringify(body));

  // ZapSign envia: { event_type, document: { token, status, ... } }
  // ou formato legado: { token, status }
  const docToken: string = body?.document?.token || body?.token || '';
  const status: string = body?.document?.status || body?.status || '';
  const eventType: string = body?.event_type || '';

  // Considera assinado quando status é "signed" ou event_type contém "signed"
  const assinado = status === 'signed' || eventType.includes('signed');

  if (!docToken) {
    return NextResponse.json({ ok: false, erro: 'token não encontrado no payload' }, { status: 200 });
  }

  if (!assinado) {
    // Evento intermediário (ex: um signatário assinou mas faltam outros) — ignora silenciosamente
    return NextResponse.json({ ok: true, ignorado: true, status, eventType });
  }

  const supabase = db();
  const { error } = await supabase
    .from('leads')
    .update({ zapsign_assinado: true })
    .eq('zapsign_token', docToken);

  if (error) {
    console.error('[zapsign/webhook] update error', error);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 200 }); // 200 para ZapSign não retentar
  }

  return NextResponse.json({ ok: true });
}
