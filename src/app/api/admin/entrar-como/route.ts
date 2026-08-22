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

// POST { empresa_id } — gera um link mágico do Supabase pro diretor daquela empresa,
// pra entrar de verdade no ambiente dela sem precisar de senha compartilhada nem
// gambiarra de URL. É uma sessão real do usuário real (não bypassa RLS, não precisa
// de tabela de override).
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id } = body;
  if (!empresa_id) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 422 });

  const db = supabaseAdmin();

  const { data: profileDiretor } = await db.from('profiles')
    .select('id').eq('empresa_id', empresa_id).eq('cargo', 'diretor').limit(1).maybeSingle();

  let profileId = profileDiretor?.id as string | undefined;
  if (!profileId) {
    const { data: qualquerProfile } = await db.from('profiles')
      .select('id').eq('empresa_id', empresa_id).limit(1).maybeSingle();
    profileId = qualquerProfile?.id;
  }

  if (!profileId) {
    return NextResponse.json({ erro: 'Nenhum usuário encontrado pra essa empresa — não dá pra entrar como ela.' }, { status: 404 });
  }

  const { data: userData, error: userError } = await db.auth.admin.getUserById(profileId);
  if (userError || !userData?.user?.email) {
    return NextResponse.json({ erro: 'Não consegui recuperar o e-mail do usuário dessa empresa.' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
    options: { redirectTo: `${appUrl}/` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json({ erro: linkError?.message || 'Falha ao gerar o link de acesso.' }, { status: 500 });
  }

  console.log(`[admin/entrar-como] empresa=${empresa_id} email=${userData.user.email}`);
  return NextResponse.json({ link: linkData.properties.action_link });
}
