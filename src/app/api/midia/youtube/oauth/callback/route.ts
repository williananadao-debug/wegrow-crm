import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { trocarCodePorTokens } from '@/lib/youtube-analytics';

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

// Redirect do Google — sem sessão de usuário aqui (é o navegador voltando da tela de
// consentimento). A prova de autorização é o próprio "state": só foi gerado por quem já
// tinha passado pela checagem de diretor em /oauth/iniciar.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const erroGoogle = url.searchParams.get('error');

  const voltarPara = (status: 'sucesso' | 'erro', msg?: string) => {
    const destino = new URL('/midia/configuracoes', baseUrl());
    destino.searchParams.set('youtube_oauth', status);
    if (msg) destino.searchParams.set('msg', msg);
    return NextResponse.redirect(destino);
  };

  if (erroGoogle) return voltarPara('erro', erroGoogle);
  if (!code || !state) return voltarPara('erro', 'Faltou code ou state no retorno do Google.');

  let empresa_id: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    empresa_id = parsed.empresa_id;
    if (!empresa_id) throw new Error('sem empresa_id');
  } catch {
    return voltarPara('erro', 'State inválido.');
  }

  try {
    const redirectUri = `${baseUrl()}/api/midia/youtube/oauth/callback`;
    const tokens = await trocarCodePorTokens(code, redirectUri);
    if (!tokens.refresh_token) {
      // Acontece quando o usuário já autorizou antes e o Google não reemite o refresh
      // token — teria que revogar o acesso em myaccount.google.com/permissions e tentar de novo.
      return voltarPara('erro', 'Google não retornou refresh_token — revogue o acesso em myaccount.google.com/permissions e tente conectar de novo.');
    }

    const db = supabaseAdmin();
    const { error } = await db.from('midia_meta_config').upsert([{
      empresa_id,
      youtube_oauth_refresh_token: tokens.refresh_token,
      youtube_oauth_conectado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }], { onConflict: 'empresa_id' });

    if (error) return voltarPara('erro', error.message);
    return voltarPara('sucesso');
  } catch (err: any) {
    return voltarPara('erro', err.message);
  }
}
