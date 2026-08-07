import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

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

// POST — sobe logo da empresa (base64) pro bucket "empresa-logos" e grava a URL pública
// em empresas.logo_url. Upload só via service role (admin), sem policy de storage.objects.
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresaId, imagemBase64, extensao } = body;
  if (!empresaId || !imagemBase64) {
    return NextResponse.json({ erro: 'empresaId e imagemBase64 são obrigatórios.' }, { status: 422 });
  }

  const db = supabaseAdmin();
  const buffer = Buffer.from(imagemBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const ext = (extensao || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
  const path = `${empresaId}/${Date.now()}.${ext}`;

  const { error: upErr } = await db.storage.from('empresa-logos').upload(path, buffer, {
    contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    upsert: false,
  });
  if (upErr) return NextResponse.json({ erro: upErr.message }, { status: 500 });

  const { data: urlData } = db.storage.from('empresa-logos').getPublicUrl(path);

  const { error: updErr } = await db.from('empresas').update({ logo_url: urlData.publicUrl }).eq('id', empresaId);
  if (updErr) return NextResponse.json({ erro: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, logoUrl: urlData.publicUrl });
}
