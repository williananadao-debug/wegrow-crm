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
  try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, doc_name, doc_url, signers } = body;
  if (!empresa_id || !signers?.length) {
    return NextResponse.json({ erro: 'Campos obrigatórios: empresa_id, signers.' }, { status: 422 });
  }

  const { data: empresa } = await db()
    .from('empresas')
    .select('modulos')
    .eq('id', empresa_id)
    .single();

  const apiToken = empresa?.modulos?.zapsign_token;
  const templateToken = empresa?.modulos?.zapsign_template;

  if (!apiToken) {
    return NextResponse.json({ erro: 'Token ZapSign não configurado. Acesse Configurações > Integrações.' }, { status: 400 });
  }

  const mappedSigners = signers.map((s: any) => ({
    name: s.name,
    email: s.email || undefined,
    phone: s.phone ? s.phone.replace(/\D/g, '') : undefined,
    send_automatic_email: Boolean(s.email),
    send_automatic_whatsapp: Boolean(s.phone && !s.email),
  }));

  let zapRes: Response;

  if (templateToken) {
    // Usa template — contrato gerado automaticamente pelo ZapSign
    zapRes = await fetch(`https://api.zapsign.com.br/api/v1/models/${templateToken}/create-doc/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: doc_name || 'Contrato WeGrow',
        lang: 'pt-br',
        signers: mappedSigners,
      }),
    });
  } else {
    // Fallback: usa PDF via URL
    if (!doc_url) return NextResponse.json({ erro: 'Informe a URL do PDF ou configure um template ZapSign.' }, { status: 422 });
    zapRes = await fetch('https://api.zapsign.com.br/api/v1/docs/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: doc_name || 'Contrato WeGrow',
        url_pdf: doc_url,
        signers: mappedSigners,
      }),
    });
  }

  const zapData = await zapRes.json();
  if (!zapRes.ok) {
    console.error('[zapsign]', zapData);
    return NextResponse.json({ erro: zapData?.detail || 'Erro ao criar documento no ZapSign.' }, { status: 502 });
  }

  const link = zapData.signers?.[0]?.sign_url ?? null;
  return NextResponse.json({ ok: true, doc_token: zapData.token, sign_url: link, open_id: zapData.open_id });
}
