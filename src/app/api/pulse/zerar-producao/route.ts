import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// POST { producaoId } ou { todas: true } — volta a(s) produção(ões) pra etapa 0 / "em produção" e
// apaga o histórico de etapas ("Etapa concluída…" e "Movida para…"). Fica o evento de início,
// comentários, fotos e aditivos. Só diretor, só da própria empresa. Pensado pra limpar avanço de teste.
export async function POST(req: NextRequest) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo, nome').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });
  if (perfil.cargo !== 'diretor') return NextResponse.json({ erro: 'Só o diretor pode zerar etapas.' }, { status: 403 });

  let body: { producaoId?: number; todas?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  let q = db.from('pulse_producoes').select('id').eq('empresa_id', perfil.empresa_id);
  if (!body.todas) {
    if (!body.producaoId) return NextResponse.json({ erro: 'Informe producaoId ou todas.' }, { status: 422 });
    q = q.eq('id', Number(body.producaoId));
  }
  const { data: prods } = await q;
  const ids = (prods || []).map(p => p.id);
  if (ids.length === 0) return NextResponse.json({ erro: 'Produção não encontrada.' }, { status: 404 });

  const { error: e1 } = await db.from('pulse_producao_eventos').delete().in('producao_id', ids).eq('tipo', 'etapa');
  const { error: e2 } = await db.from('pulse_producao_eventos').delete().in('producao_id', ids).eq('tipo', 'status').ilike('texto', 'Movida para%');
  const { error: e3 } = await db.from('pulse_producoes').update({ etapa_fabricacao_idx: 0, status: 'em_producao' }).in('id', ids);
  if (e1 || e2 || e3) return NextResponse.json({ erro: (e1 || e2 || e3)!.message }, { status: 500 });

  console.warn(`[zerar-producao] ${perfil.nome} (${user.id}) zerou ${ids.length} produção(ões)`);
  return NextResponse.json({ ok: true, producoes: ids.length });
}
