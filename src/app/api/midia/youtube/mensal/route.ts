import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarVisualizacoesMensaisYoutube } from '@/lib/youtube-analytics';

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

export async function GET(request: Request) {
  const auth = await verificarUsuario(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const url = new URL(request.url);
  const hoje = new Date();
  const ano = Number(url.searchParams.get('ano')) || hoje.getFullYear();
  const mes = Number(url.searchParams.get('mes')) || hoje.getMonth() + 1;

  const db = supabaseAdmin();
  const { data: config } = await db.from('midia_meta_config').select('youtube_oauth_refresh_token').eq('empresa_id', auth.empresa_id).maybeSingle();

  if (!config?.youtube_oauth_refresh_token) {
    return NextResponse.json({ erro: 'YouTube ainda não conectado via Google. Conecte em Demais FM Comercial → Configurações.' }, { status: 400 });
  }

  try {
    const visualizacoes = await buscarVisualizacoesMensaisYoutube(config.youtube_oauth_refresh_token, ano, mes);
    return NextResponse.json({ ano, mes, visualizacoes });
  } catch (err: any) {
    return NextResponse.json({ erro: `Erro ao consultar YouTube Analytics: ${err.message}` }, { status: 502 });
  }
}
