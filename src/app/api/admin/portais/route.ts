import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await db().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

export async function GET(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const empresa_id = searchParams.get('empresa_id');
  if (!empresa_id) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 422 });
  const { data, error } = await db().from('empresa_portais').select('*').eq('empresa_id', empresa_id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const { data, error } = await db().from('empresa_portais').insert([body]).select().single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ erro: 'id obrigatório.' }, { status: 422 });
  const { data, error } = await db().from('empresa_portais').update(campos).eq('id', id).select().single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ erro: 'id obrigatório.' }, { status: 422 });
  const { error } = await db().from('empresa_portais').delete().eq('id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
