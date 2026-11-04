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

// POST — sobe a logo de uma unidade (base64) pro bucket "empresa-logos", na pasta da empresa,
// e grava em unidades.logo_url. Só PNG/JPG: a logo vai pro contrato em PDF (pdfkit não lê WebP/SVG).
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { unidadeId, imagemBase64 } = body;
  if (!unidadeId || !imagemBase64) {
    return NextResponse.json({ erro: 'unidadeId e imagemBase64 são obrigatórios.' }, { status: 422 });
  }
  const tipo = String(imagemBase64).match(/^data:image\/(png|jpe?g);base64,/i)?.[1]?.toLowerCase();
  if (!tipo) return NextResponse.json({ erro: 'Use uma imagem PNG ou JPG.' }, { status: 422 });
  const ext = tipo === 'png' ? 'png' : 'jpg';

  const db = supabaseAdmin();
  const { data: unidade } = await db.from('unidades').select('id, empresa_id').eq('id', unidadeId).maybeSingle();
  if (!unidade) return NextResponse.json({ erro: 'Unidade não encontrada.' }, { status: 404 });

  const buffer = Buffer.from(imagemBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const path = `${unidade.empresa_id}/unidades/${unidade.id}-${Date.now()}.${ext}`;

  const { error: upErr } = await db.storage.from('empresa-logos').upload(path, buffer, {
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ erro: upErr.message }, { status: 500 });

  const { data: urlData } = db.storage.from('empresa-logos').getPublicUrl(path);

  const { error: updErr } = await db.from('unidades').update({ logo_url: urlData.publicUrl }).eq('id', unidade.id);
  if (updErr) return NextResponse.json({ erro: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, logoUrl: urlData.publicUrl });
}
