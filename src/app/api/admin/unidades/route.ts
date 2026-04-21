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

// GET ?empresa_id=xxx
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa_id');
  if (!empresaId) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('unidades')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome');

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — cria unidade
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, nome, razao_social, cnpj, endereco, cidade, estado } = body;
  if (!empresa_id || !nome) return NextResponse.json({ erro: 'empresa_id e nome obrigatórios.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('unidades')
    .insert([{ empresa_id, nome, razao_social, cnpj, endereco, cidade, estado }])
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE ?id=xxx
export async function DELETE(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ erro: 'id obrigatório.' }, { status: 422 });

  const { error } = await supabaseAdmin().from('unidades').delete().eq('id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
