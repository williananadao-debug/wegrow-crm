import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// POST { userId, ativo } — desativa (ativo=false) ou reativa um usuário da própria empresa.
// Desativar = ban no Supabase Auth (não loga mais nem renova a sessão) + profiles.desativado_em
// (a tela mostra "Desativado" e tira o usuário das listas de atribuição). Nada é apagado:
// leads, metas, visitas e relatórios continuam com o nome dele. SÓ DIRETOR.
export async function POST(request: Request) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: { user: solicitante } } = await db.auth.getUser(accessToken);
  if (!solicitante) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });

  const { data: perfilSolicitante } = await db.from('profiles').select('cargo, empresa_id').eq('id', solicitante.id).single();
  if (perfilSolicitante?.cargo !== 'diretor') return NextResponse.json({ erro: 'Acesso restrito a diretores.' }, { status: 403 });

  const { userId, ativo } = await request.json().catch(() => ({}));
  if (!userId || typeof ativo !== 'boolean') return NextResponse.json({ erro: 'userId e ativo são obrigatórios.' }, { status: 422 });
  if (userId === solicitante.id) return NextResponse.json({ erro: 'Você não pode desativar a sua própria conta.' }, { status: 400 });

  const { data: perfilAlvo } = await db.from('profiles').select('empresa_id').eq('id', userId).single();
  if (!perfilAlvo || perfilAlvo.empresa_id !== perfilSolicitante.empresa_id) {
    return NextResponse.json({ erro: 'Usuário não pertence à sua empresa.' }, { status: 403 });
  }

  // Ban primeiro: se falhar, nada muda na tela e o usuário não fica "desativado" com acesso.
  const { error: banErro } = await db.auth.admin.updateUserById(userId, { ban_duration: ativo ? 'none' : '876000h' });
  if (banErro) return NextResponse.json({ erro: `Não foi possível ${ativo ? 'reativar' : 'bloquear'} o acesso: ${banErro.message}` }, { status: 500 });

  const { error } = await db.from('profiles').update({ desativado_em: ativo ? null : new Date().toISOString() }).eq('id', userId);
  if (error) {
    // Desfaz o ban pra não deixar os dois lados diferentes.
    await db.auth.admin.updateUserById(userId, { ban_duration: ativo ? '876000h' : 'none' });
    const semColuna = /desativado_em/.test(error.message);
    return NextResponse.json({ erro: semColuna ? 'Falta rodar a migration 20261008100000_profiles_desativado.sql no Supabase.' : error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
