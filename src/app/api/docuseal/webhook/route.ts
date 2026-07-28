import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const WEBHOOK_SECRET = process.env.DOCUSEAL_WEBHOOK_SECRET || '';
const BUCKET = 'contratos-assinados';

// Docuseal assina o corpo com HMAC-SHA256: header "X-Docuseal-Signature: <timestamp>.<assinatura>",
// conteúdo assinado é "<timestamp>.<corpo_bruto>". Configurar o mesmo segredo em
// Docuseal → Settings → Webhooks → Secret e na env var DOCUSEAL_WEBHOOK_SECRET.
function assinaturaValida(rawBody: string, header: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.error('[docuseal/webhook] DOCUSEAL_WEBHOOK_SECRET não configurado — verificação de assinatura DESATIVADA. Configure a env var para proteger este endpoint contra requisições forjadas.');
    return true;
  }
  if (!header) return false;
  const [timestamp, signature] = header.split('.');
  if (!timestamp || !signature) return false;

  const payload = `${timestamp}.${rawBody}`;
  const esperada = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(esperada));
  } catch {
    return false;
  }
}

async function baixarEArquivar(supabase: any, url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

async function arquivarDocumentosAssinados(supabase: any, leadId: number, submissionId: string, data: any) {
  const documentos: any[] = data?.documents || [];
  const auditLogUrl: string | undefined = data?.audit_log_url;
  const combinedUrl: string | undefined = data?.combined_document_url;

  const arquivos: { nome: string; path: string }[] = [];

  if (combinedUrl) {
    const path = `${leadId}/${submissionId}/contrato_completo.pdf`;
    await baixarEArquivar(supabase, combinedUrl, path);
    arquivos.push({ nome: 'contrato_completo.pdf', path });
  }

  for (const doc of documentos) {
    if (!doc?.url) continue;
    const nome = `${String(doc.name || 'documento').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    const path = `${leadId}/${submissionId}/${nome}`;
    await baixarEArquivar(supabase, doc.url, path);
    arquivos.push({ nome, path });
  }

  if (auditLogUrl) {
    const path = `${leadId}/${submissionId}/certificado_assinatura.pdf`;
    await baixarEArquivar(supabase, auditLogUrl, path);
    arquivos.push({ nome: 'certificado_assinatura.pdf', path });
  }

  if (arquivos.length > 0) {
    await supabase.from('leads').update({ docuseal_arquivos: arquivos }).eq('id', leadId);
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-docuseal-signature');

  if (!assinaturaValida(rawBody, signatureHeader)) {
    console.error('[docuseal/webhook] Assinatura HMAC inválida — requisição rejeitada.');
    return NextResponse.json({ ok: false, erro: 'assinatura inválida' }, { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  console.log('[docuseal/webhook]', JSON.stringify(body).slice(0, 500));

  // Docuseal envia: { event_type: "form.completed", data: { submission: { id, ... }, documents, audit_log_url, ... } }
  const eventType: string = body?.event_type || '';
  const data = body?.data || {};
  const submissionId: string = String(data?.submission?.id || data?.id || body?.submission?.id || '');

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

  // Baixa e arquiva o contrato assinado + certificado de auditoria (prova jurídica independente do Docuseal)
  try {
    await arquivarDocumentosAssinados(supabase, lead.id, submissionId, data);
  } catch (err: any) {
    console.error('[docuseal/webhook] Erro ao arquivar documentos assinados:', err.message);
  }

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
