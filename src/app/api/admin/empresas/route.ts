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

// GET — lista todas as empresas com contagem de usuários
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();

  const [{ data: empresas }, { data: profiles }] = await Promise.all([
    db.from('empresas').select('*').order('created_at', { ascending: false }),
    db.from('profiles').select('empresa_id, cargo'),
  ]);

  const contagemPorEmpresa = (profiles || []).reduce<Record<string, number>>((acc, p) => {
    if (p.empresa_id) acc[p.empresa_id] = (acc[p.empresa_id] || 0) + 1;
    return acc;
  }, {});

  const resultado = (empresas || []).map(e => ({
    ...e,
    total_usuarios: contagemPorEmpresa[e.id] || 0,
  }));

  return NextResponse.json(resultado);
}

// POST — cria empresa
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { nome, cnpj, plano, status, modulos } = body;
  if (!nome) return NextResponse.json({ erro: 'Nome obrigatório.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('empresas')
    .insert([{ nome, cnpj, plano: plano || 'essencial', status: status || 'trial', modulos: modulos || {} }])
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — atualiza empresa (plano, status, módulos)
export async function PATCH(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ erro: 'ID obrigatório.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('empresas')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}
