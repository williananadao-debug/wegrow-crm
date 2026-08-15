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

// GET — lista todos os prospects (pipeline interno da WeGrow, não é dado de cliente)
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const { data, error } = await supabaseAdmin()
    .from('wegrow_prospects')
    .select('*')
    .order('nome');

  if (error?.code === '42P01') return NextResponse.json({ semTabela: true, itens: [] });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ semTabela: false, itens: data || [] });
}

// POST — cria um prospect novo
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  if (!body.nome) return NextResponse.json({ erro: 'Nome obrigatório.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('wegrow_prospects')
    .insert([{
      nome: body.nome,
      segmento: body.segmento ?? null,
      cidade: body.cidade ?? null,
      status: body.status ?? 'bom_fit',
      canal: body.canal ?? null,
      faturamento_nota: body.faturamento_nota ?? null,
      fonte: body.fonte ?? null,
      estrategia: body.estrategia ?? null,
      contato: body.contato ?? null,
      whatsapp: body.whatsapp ?? null,
      notas: body.notas ?? null,
      proxima_acao_em: body.proxima_acao_em ?? null,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — atualiza campos de um prospect existente
export async function PATCH(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ erro: 'ID obrigatório.' }, { status: 422 });

  const { data, error } = await supabaseAdmin()
    .from('wegrow_prospects')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove um prospect (ex.: entrada duplicada ou definitivamente perdido)
export async function DELETE(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ erro: 'ID obrigatório.' }, { status: 422 });

  const { error } = await supabaseAdmin().from('wegrow_prospects').delete().eq('id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
