import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// GET/POST da alíquota efetiva do Simples (fiscal_integracoes.aliquota_simples) — usada no
// crédito de ICMS da CSOSN 101. A tabela tem os tokens do Focus NFe, por isso não é lida
// direto pelo navegador. Ler: diretor/gerente. Alterar: só diretor.
async function contexto(req: Request) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { erro: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return { erro: NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 }) };
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id || !['diretor', 'gerente'].includes(perfil.cargo)) {
    return { erro: NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }) };
  }
  return { db, perfil };
}

export async function GET(req: Request) {
  const ctx = await contexto(req);
  if (ctx.erro) return ctx.erro;
  const { data } = await ctx.db.from('fiscal_integracoes').select('*').eq('empresa_id', ctx.perfil.empresa_id).maybeSingle();
  if (!data) return NextResponse.json({ integracao: false, aliquota: null });
  return NextResponse.json({ integracao: true, aliquota: data.aliquota_simples != null ? Number(data.aliquota_simples) : null });
}

export async function POST(req: Request) {
  const ctx = await contexto(req);
  if (ctx.erro) return ctx.erro;
  if (ctx.perfil.cargo !== 'diretor') return NextResponse.json({ error: 'Só a diretoria altera a alíquota.' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const aliquota = Math.round(Number(body?.aliquota) * 100) / 100;
  if (!(aliquota > 0 && aliquota < 20)) return NextResponse.json({ error: 'Alíquota inválida (ex.: 3,83).' }, { status: 400 });
  const { error } = await ctx.db.from('fiscal_integracoes').update({ aliquota_simples: aliquota }).eq('empresa_id', ctx.perfil.empresa_id);
  if (error) {
    const semColuna = /aliquota_simples/.test(error.message);
    return NextResponse.json({ error: semColuna ? 'Falta rodar a migration 20261008120000_fiscal_aliquota_simples.sql no Supabase.' : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, aliquota });
}
