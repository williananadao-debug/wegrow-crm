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
  const { data: lead, error } = await supabase
    .from('leads')
    .update({ zapsign_assinado: true })
    .eq('zapsign_token', docToken)
    .select('id')
    .single();

  if (error) {
    console.error('[zapsign/webhook] update error', error);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 200 }); // 200 para ZapSign não retentar
  }

  if (lead) {
    // Libera o(s) job(s) de produção que estavam ocultos aguardando a assinatura do contrato
    const leadRef = `LD-${String(lead.id).padStart(4, '0')}`;
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id')
      .ilike('briefing', `%${leadRef}%`)
      .eq('stage', 'aguardando_assinatura');

    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map((j: any) => j.id);
      await supabase.from('jobs').update({ stage: 'roteiro' }).in('id', jobIds);
      console.log(`[zapsign/webhook] ${jobIds.length} job(s) liberado(s) para roteiro. Lead: ${lead.id}`);
    }
  }

  return NextResponse.json({ ok: true });
}
