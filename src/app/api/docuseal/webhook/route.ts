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

  console.log('[docuseal/webhook]', JSON.stringify(body).slice(0, 500));

  // Docuseal envia: { event_type: "form.completed", data: { submission: { id, ... } } }
  const eventType: string = body?.event_type || '';
  const submissionId: string = String(body?.data?.submission?.id || body?.submission?.id || '');

  if (!submissionId) {
    return NextResponse.json({ ok: false, erro: 'submission_id não encontrado no payload' });
  }

  // Só processa quando todos assinaram
  if (eventType !== 'form.completed') {
    return NextResponse.json({ ok: true, ignorado: true, eventType });
  }

  const supabase = db();

  // Busca o lead pelo submission_id
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, briefing')
    .eq('docuseal_submission_id', submissionId)
    .single();

  if (leadErr || !lead) {
    console.error('[docuseal/webhook] lead não encontrado para submission_id:', submissionId);
    return NextResponse.json({ ok: false, erro: 'lead não encontrado' });
  }

  // Marca lead como assinado
  await supabase
    .from('leads')
    .update({ docuseal_assinado: true })
    .eq('id', lead.id);

  // Avança job associado para 'aprovacao' (OPEC/No Ar)
  const leadRef = `LD-${String(lead.id).padStart(4, '0')}`;
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, stage')
    .ilike('briefing', `%${leadRef}%`)
    .neq('stage', 'entregue');

  if (jobs && jobs.length > 0) {
    const jobIds = jobs.map((j: any) => j.id);
    await supabase
      .from('jobs')
      .update({ stage: 'aprovacao' })
      .in('id', jobIds);

    console.log(`[docuseal/webhook] ${jobIds.length} job(s) avançado(s) para aprovacao. Lead: ${lead.id}`);
  }

  return NextResponse.json({ ok: true, lead_id: lead.id });
}
