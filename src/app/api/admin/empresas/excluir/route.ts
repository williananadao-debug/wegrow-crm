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

// POST { empresa_id, confirmarNome } — apaga o tenant de verdade: os usuários (auth +
// profiles) e o registro em "empresas". NÃO varre as dezenas de tabelas de dados de
// negócio (leads, clientes, financeiro etc.) de cada módulo — o que sobrar fica órfão
// (empresa_id sem dono), inacessível por qualquer usuário normal já que a RLS sempre
// filtra pelo empresa_id do profile de quem está logado. Pensado pra apagar empresa de
// teste/demo ou cadastro que travou, não pra encerrar cliente com histórico de verdade.
export async function POST(request: Request) {
  const admin = await verificarAdmin(request);
  if (!admin) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, confirmarNome } = body;
  if (!empresa_id) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 422 });

  const db = supabaseAdmin();

  const { data: empresa } = await db.from('empresas').select('id, nome').eq('id', empresa_id).maybeSingle();
  if (!empresa) return NextResponse.json({ erro: 'Empresa não encontrada.' }, { status: 404 });

  if (String(confirmarNome || '').trim() !== empresa.nome) {
    return NextResponse.json({ erro: 'Nome de confirmação não bate com o nome da empresa.' }, { status: 422 });
  }

  const { data: profiles } = await db.from('profiles').select('id').eq('empresa_id', empresa_id);
  for (const p of profiles || []) {
    await db.auth.admin.deleteUser(p.id).catch(() => {});
  }
  await db.from('profiles').delete().eq('empresa_id', empresa_id);
  await db.from('clientes_wegrow').delete().eq('empresa_id', empresa_id);
  const { error: erroEmpresa } = await db.from('empresas').delete().eq('id', empresa_id);
  if (erroEmpresa) return NextResponse.json({ erro: erroEmpresa.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
