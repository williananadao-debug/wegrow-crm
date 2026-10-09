import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// POST { eventoIds: number[], status: 'aprovada' | 'recusada' | 'pendente' } — aprova/recusa foto
// da produção pro Portal do Cliente. Só diretor/gerente (a gestão valida o que o cliente vê);
// por isso passa pelo servidor em vez de update direto do navegador.
export async function POST(req: Request) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 403 });
  if (!['diretor', 'gerente'].includes(perfil.cargo)) return NextResponse.json({ error: 'Só a gestão (diretor/gerente) aprova fotos pro cliente.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.eventoIds) ? body.eventoIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  const status = body?.status;
  if (ids.length === 0 || ids.length > 200) return NextResponse.json({ error: 'Selecione de 1 a 200 fotos.' }, { status: 400 });
  if (!['aprovada', 'recusada', 'pendente'].includes(status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });

  // Só eventos de produções da própria empresa.
  const { data: eventos } = await db.from('pulse_producao_eventos').select('id, producao_id').in('id', ids).not('foto_url', 'is', null);
  const prodIds = [...new Set((eventos || []).map(e => e.producao_id))];
  const { data: prods } = prodIds.length
    ? await db.from('pulse_producoes').select('id').in('id', prodIds).eq('empresa_id', perfil.empresa_id)
    : { data: [] };
  const permitidas = new Set((prods || []).map(p => p.id));
  const validos = (eventos || []).filter(e => permitidas.has(e.producao_id)).map(e => e.id);
  if (validos.length === 0) return NextResponse.json({ error: 'Nenhuma foto encontrada.' }, { status: 404 });

  const { error } = await db.from('pulse_producao_eventos').update({
    foto_status: status,
    foto_avaliada_por: status === 'pendente' ? null : user.id,
    foto_avaliada_em: status === 'pendente' ? null : new Date().toISOString(),
  }).in('id', validos);
  if (error) {
    const semColuna = /foto_status|foto_avaliada/.test(error.message);
    return NextResponse.json({ error: semColuna ? 'Falta rodar a migration 20261009120000_producao_fotos_aprovacao.sql no Supabase.' : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, atualizadas: validos.length });
}
