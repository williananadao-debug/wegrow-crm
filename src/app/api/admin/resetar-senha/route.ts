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

function gerarSenhaTemporaria(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// POST { empresa_id } — gera uma senha temporária nova pro diretor daquela empresa e já
// troca de verdade no Supabase Auth (auth.admin.updateUserById). Existe porque a senha
// temporária só aparece uma vez na criação e, se ninguém copiar a tempo, não tem como
// recuperar — isso dá um jeito de sempre conseguir voltar a logar numa empresa qualquer,
// mesmo criada antes desse cuidado existir.
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
    return NextResponse.json({ erro: 'Nenhum usuário encontrado pra essa empresa — não dá pra resetar senha de ninguém.' }, { status: 404 });
  }

  const { data: userData, error: userError } = await db.auth.admin.getUserById(profileId);
  if (userError || !userData?.user?.email) {
    return NextResponse.json({ erro: 'Não consegui recuperar o e-mail do usuário dessa empresa.' }, { status: 500 });
  }

  const senhaTemp = gerarSenhaTemporaria();
  const { error: updateError } = await db.auth.admin.updateUserById(profileId, { password: senhaTemp });
  if (updateError) {
    return NextResponse.json({ erro: `Falha ao trocar a senha: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ email: userData.user.email, senha: senhaTemp });
}
