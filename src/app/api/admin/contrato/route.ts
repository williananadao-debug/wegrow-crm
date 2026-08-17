import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const DOCUSEAL_URL = (process.env.DOCUSEAL_URL || '').replace(/\/$/, '');
const DOCUSEAL_TOKEN = process.env.DOCUSEAL_TOKEN || '';
const DOCUSEAL_SIGN_BASE = (process.env.DOCUSEAL_SIGN_BASE_URL || DOCUSEAL_URL).replace(/\/$/, '');

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

// POST — recebe o PDF do contrato de serviço WeGrow↔cliente, cria um template no Docuseal
// SEM campos de assinatura posicionados (não dá pra adivinhar onde fica o bloco de assinatura
// num PDF arbitrário) e devolve o link do editor do Docuseal pra você arrastar os campos lá.
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN)
    return NextResponse.json({ erro: 'Docuseal não configurado no servidor (DOCUSEAL_URL/DOCUSEAL_TOKEN).' }, { status: 500 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, pdf_base64, nome_arquivo, nome_empresa } = body;
  if (!empresa_id || !pdf_base64) return NextResponse.json({ erro: 'empresa_id e pdf_base64 são obrigatórios.' }, { status: 422 });

  const templateRes = await fetch(`${DOCUSEAL_URL}/templates/pdf`, {
    method: 'POST',
    headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Contrato de serviço — ${nome_empresa || 'Cliente'}`,
      documents: [{ name: nome_arquivo || 'contrato.pdf', file: pdf_base64 }],
    }),
  });

  if (!templateRes.ok) {
    const txt = await templateRes.text();
    console.error('[admin/contrato/template]', templateRes.status, txt.slice(0, 300));
    return NextResponse.json({ erro: 'Erro ao criar template no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
  }

  const template = await templateRes.json();
  const editUrl = `${DOCUSEAL_SIGN_BASE}/templates/${template.id}`;

  const db = supabaseAdmin();
  const { error } = await db.from('clientes_wegrow').update({
    contrato_template_id: String(template.id),
    contrato_edit_url: editUrl,
    contrato_status: 'rascunho',
    contrato_submission_id: null,
    contrato_sign_url: null,
    contrato_enviado_em: null,
    contrato_assinado_em: null,
  }).eq('empresa_id', empresa_id);

  if (error) return NextResponse.json({ erro: 'Template criado no Docuseal, mas falhou ao salvar: ' + error.message }, { status: 500 });

  return NextResponse.json({ ok: true, template_id: template.id, edit_url: editUrl });
}

// PATCH — depois que os campos de assinatura foram posicionados no editor do Docuseal
// (link retornado pelo POST acima), dispara o envio pra assinatura do cliente.
export async function PATCH(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN)
    return NextResponse.json({ erro: 'Docuseal não configurado no servidor.' }, { status: 500 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, signer_nome, signer_email } = body;
  if (!empresa_id || !signer_nome || !signer_email)
    return NextResponse.json({ erro: 'empresa_id, signer_nome e signer_email são obrigatórios.' }, { status: 422 });

  const db = supabaseAdmin();
  const { data: cliente, error: buscaErr } = await db
    .from('clientes_wegrow')
    .select('contrato_template_id')
    .eq('empresa_id', empresa_id)
    .single();

  if (buscaErr || !cliente?.contrato_template_id)
    return NextResponse.json({ erro: 'Nenhum template de contrato criado ainda pra essa empresa — suba o PDF primeiro.' }, { status: 422 });

  const submissionRes = await fetch(`${DOCUSEAL_URL}/submissions`, {
    method: 'POST',
    headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: Number(cliente.contrato_template_id),
      send_email: true,
      submitters: [{ name: signer_nome, email: signer_email, role: 'Cliente' }],
    }),
  });

  if (!submissionRes.ok) {
    const txt = await submissionRes.text();
    console.error('[admin/contrato/submission]', submissionRes.status, txt.slice(0, 300));
    return NextResponse.json({ erro: 'Erro ao enviar pra assinatura: ' + txt.slice(0, 200) }, { status: 502 });
  }

  const submitters: any[] = await submissionRes.json();
  const submitter = submitters[0];
  const signUrl = submitter ? `${DOCUSEAL_SIGN_BASE}/s/${submitter.slug}` : null;

  const { error: updateErr } = await db.from('clientes_wegrow').update({
    contrato_submission_id: String(submitter?.submission_id ?? ''),
    contrato_status: 'enviado',
    contrato_signer_nome: signer_nome,
    contrato_signer_email: signer_email,
    contrato_sign_url: signUrl,
    contrato_enviado_em: new Date().toISOString(),
  }).eq('empresa_id', empresa_id);

  if (updateErr) return NextResponse.json({ erro: 'Enviado no Docuseal, mas falhou ao salvar status: ' + updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, sign_url: signUrl });
}
