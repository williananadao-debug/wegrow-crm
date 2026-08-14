import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { urlAutorizacaoGoogle } from '@/lib/youtube-analytics';

export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
}

export async function POST(request: Request) {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.json({ erro: 'GOOGLE_OAUTH_CLIENT_ID/SECRET não configurados no servidor.' }, { status: 503 });
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).single();
  if (!perfil?.empresa_id || perfil.cargo !== 'diretor') {
    return NextResponse.json({ erro: 'Só diretor pode conectar o YouTube.' }, { status: 403 });
  }

  const redirectUri = `${baseUrl()}/api/midia/youtube/oauth/callback`;
  const state = Buffer.from(JSON.stringify({ empresa_id: perfil.empresa_id })).toString('base64url');
  const authUrl = urlAutorizacaoGoogle(redirectUri, state);
  return NextResponse.json({ authUrl });
}
