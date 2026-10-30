import { NextResponse } from 'next/server';
import { supabaseAdmin, resetarSenhaDiretor } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
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

  const r = await resetarSenhaDiretor(supabaseAdmin(), empresa_id);
  if ('erro' in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  return NextResponse.json({ email: r.email, senha: r.senha });
}
