import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarEstatisticasCanalYoutube } from '@/lib/youtube-api';

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
  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ erro: 'YOUTUBE_API_KEY não configurada no servidor.' }, { status: 503 });
  }

  const auth = await verificarUsuario(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();
  const { data: config } = await db.from('midia_meta_config').select('youtube_channel_id').eq('empresa_id', auth.empresa_id).maybeSingle();

  if (!config?.youtube_channel_id) {
    return NextResponse.json({ erro: 'YouTube ainda não configurado. Cadastre o Channel ID em Mídia → Configurações.' }, { status: 400 });
  }

  try {
    const dados = await buscarEstatisticasCanalYoutube(config.youtube_channel_id, process.env.YOUTUBE_API_KEY);
    return NextResponse.json(dados);
  } catch (err: any) {
    return NextResponse.json({ erro: `Erro ao consultar o YouTube: ${err.message}` }, { status: 502 });
  }
}
