import { NextResponse } from 'next/server';
import { supabaseAdmin, gerarLinkEntrarComo } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

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

  const r = await gerarLinkEntrarComo(supabaseAdmin(), empresa_id);
  if ('erro' in r) return NextResponse.json({ erro: r.erro }, { status: r.status });

  console.log(`[admin/entrar-como] empresa=${empresa_id} email=${r.email}`);
  return NextResponse.json({ link: r.link });
}
