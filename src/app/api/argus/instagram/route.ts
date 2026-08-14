import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarInsightsInstagram } from '@/lib/meta-graph';

export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarUsuario(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id) return null;
  return { user, empresa_id: perfil.empresa_id };
}

function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

export async function GET(request: Request) {
  const auth = await verificarUsuario(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const url = new URL(request.url);
  const hoje = new Date();
  const ano = Number(url.searchParams.get('ano')) || hoje.getFullYear();
  const mes = Number(url.searchParams.get('mes')) || hoje.getMonth() + 1;

  const db = supabaseAdmin();
  const { data: config } = await db.from('argus_meta_config').select('ig_business_account_id, access_token').eq('empresa_id', auth.empresa_id).maybeSingle();

  if (!config?.ig_business_account_id || !config?.access_token) {
    return NextResponse.json({ erro: 'Instagram ainda não configurado. Cadastre o token e a conta abaixo.' }, { status: 400 });
  }

  const since = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const until = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`;

  try {
    const dados = await buscarInsightsInstagram(config.ig_business_account_id, config.access_token, since, until);
    return NextResponse.json({ ano, mes, ...dados });
  } catch (err: any) {
    return NextResponse.json({ erro: `Erro ao consultar o Instagram: ${err.message}` }, { status: 502 });
  }
}
