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

// GET — todos os lançamentos (fluxo de caixa interno da WeGrow, não é dado de cliente)
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const { data, error } = await supabaseAdmin()
    .from('wegrow_financeiro_lancamentos')
    .select('*')
    .order('data', { ascending: false });

  if (error?.code === '42P01') return NextResponse.json({ semTabela: true, itens: [] });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ semTabela: false, itens: data || [] });
}

// POST — cria um lançamento novo
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  if (!body.descricao || !body.tipo || body.valor == null)
    return NextResponse.json({ erro: 'Descrição, tipo e valor são obrigatórios.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('wegrow_financeiro_lancamentos')
    .insert([{
      tipo: body.tipo,
      categoria: body.categoria || 'outro',
      descricao: body.descricao,
      valor: body.valor,
      recorrente: !!body.recorrente,
      data: body.data || new Date().toISOString().substring(0, 10),
      pago: body.pago ?? true,
      observacao: body.observacao ?? null,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — atualiza campos de um lançamento existente
export async function PATCH(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ erro: 'ID obrigatório.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('wegrow_financeiro_lancamentos')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove um lançamento
export async function DELETE(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ erro: 'ID obrigatório.' }, { status: 422 });

  const { error } = await supabaseAdmin().from('wegrow_financeiro_lancamentos').delete().eq('id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
