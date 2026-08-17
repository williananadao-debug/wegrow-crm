import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarAniversarios } from '@/lib/demais-fm-api';

export const dynamic = 'force-dynamic';

// 🔒 Confidencial (classe "interno" na spec do Leo) — receita e nome de anunciante em
// `detalhe` nunca podem chegar a tela de cliente/anunciante/terceiro. Restrito a
// diretor/gerente, mesmo público que já vê /midia/aniversarios hoje.

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarLideranca(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).single();
  if (!perfil?.empresa_id || (perfil.cargo !== 'diretor' && perfil.cargo !== 'gerente')) return null;
  return { user, empresa_id: perfil.empresa_id };
}

export async function GET(request: Request) {
  if (!process.env.DEMAIS_FM_API_BASE_URL || !process.env.DEMAIS_FM_API_KEY) {
    return NextResponse.json({ erro: 'DEMAIS_FM_API_BASE_URL/DEMAIS_FM_API_KEY não configuradas no servidor.' }, { status: 503 });
  }

  const auth = await verificarLideranca(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado — dado confidencial, só diretor/gerente.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const ano = searchParams.get('ano') ? Number(searchParams.get('ano')) : undefined;
  const mes = searchParams.get('mes') ? Number(searchParams.get('mes')) : undefined;

  try {
    const dados = await buscarAniversarios(ano, mes);
    return NextResponse.json(dados);
  } catch (err: any) {
    return NextResponse.json({ erro: `Erro ao consultar a API Demais FM: ${err.message}` }, { status: 502 });
  }
}
