import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const TIPOS_VALIDOS = ['contrato', 'cronograma'] as const;
type Tipo = (typeof TIPOS_VALIDOS)[number];
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

// POST — sobe um PDF avulso (hoje usado pro cronograma, que não é gerado dinamicamente
// como o contrato — já existe pronto e só precisa ser associado à empresa): guarda uma
// cópia de backup no storage e cria o template no Docuseal. Sem campos de assinatura
// posicionados (diferente do contrato, esse PDF não tem coordenada conhecida de onde
// entra assinatura) — o admin abre o link retornado, arrasta os campos visualmente e
// manda direto pela própria interface do Docuseal, depois cola o link de assinatura de
// volta aqui (StatusEAssinatura já cobre isso).
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN)
    return NextResponse.json({ erro: 'Docuseal não configurado no servidor (DOCUSEAL_URL/DOCUSEAL_TOKEN).' }, { status: 500 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, tipo, arquivo_base64, nome_empresa } = body as { empresa_id?: string; tipo?: Tipo; arquivo_base64?: string; nome_empresa?: string };
  if (!empresa_id || !tipo || !arquivo_base64) {
    return NextResponse.json({ erro: 'empresa_id, tipo e arquivo_base64 são obrigatórios.' }, { status: 422 });
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ erro: `tipo inválido — use: ${TIPOS_VALIDOS.join(', ')}.` }, { status: 422 });
  }

  const db = supabaseAdmin();
  const path = `${empresa_id}/${tipo}.pdf`;
  const buffer = Buffer.from(arquivo_base64, 'base64');

  await db.storage.from('wegrow-documentos').upload(path, buffer, { contentType: 'application/pdf', upsert: true });

  const templateRes = await fetch(`${DOCUSEAL_URL}/templates/pdf`, {
    method: 'POST',
    headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${tipo === 'cronograma' ? 'Cronograma' : 'Documento'} — ${nome_empresa || empresa_id}`,
      documents: [{ name: `${tipo}.pdf`, file: buffer.toString('base64') }],
    }),
  });
  if (!templateRes.ok) {
    const txt = await templateRes.text();
    console.error('[admin/documentos/template]', templateRes.status, txt.slice(0, 300));
    return NextResponse.json({ erro: 'Arquivo salvo, mas falhou ao criar template no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
  }
  const template = await templateRes.json();
  const templateEditUrl = `${DOCUSEAL_SIGN_BASE}/templates/${template.id}`;

  const { error: updateErr } = await db.from('clientes_wegrow').upsert({
    empresa_id,
    [`${tipo}_arquivo_path`]: path,
    [`${tipo}_status`]: 'gerado',
  }, { onConflict: 'empresa_id' });
  if (updateErr) return NextResponse.json({ erro: 'Template criado, mas falhou ao atualizar status: ' + updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, template_edit_url: templateEditUrl });
}

// GET — devolve uma signed URL de download pra um documento já associado (contrato ou
// cronograma), pra reabrir/baixar de novo sem precisar gerar/subir de novo.
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const url = new URL(request.url);
  const empresaId = url.searchParams.get('empresa_id');
  const tipo = url.searchParams.get('tipo') as Tipo | null;
  if (!empresaId || !tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ erro: 'empresa_id e tipo (contrato|cronograma) são obrigatórios.' }, { status: 422 });
  }

  const db = supabaseAdmin();
  const { data: registro } = await db.from('clientes_wegrow').select(`${tipo}_arquivo_path`).eq('empresa_id', empresaId).maybeSingle();
  const path = (registro as any)?.[`${tipo}_arquivo_path`];
  if (!path) return NextResponse.json({ erro: 'Nenhum arquivo associado ainda.' }, { status: 404 });

  const { data: signed, error } = await db.storage.from('wegrow-documentos').createSignedUrl(path, 60 * 30);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, download_url: signed.signedUrl });
}
