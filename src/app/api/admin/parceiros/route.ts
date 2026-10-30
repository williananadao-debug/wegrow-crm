import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

// GET — parceiros com os e-mails que acessam o portal e o tamanho da carteira de cada um.
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();
  const [{ data: parceiros, error }, { data: usuarios }, { data: empresas }] = await Promise.all([
    db.from('parceiros').select('*').order('created_at'),
    db.from('parceiro_usuarios').select('parceiro_id, email').order('created_at'),
    db.from('empresas').select('id, status, modulos, parceiro_id').not('parceiro_id', 'is', null),
  ]);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json((parceiros || []).map(p => {
    const carteira = (empresas || []).filter(e => e.parceiro_id === p.id && !e.modulos?.demo);
    return {
      ...p,
      comissao_pct: Number(p.comissao_pct),
      usuarios: (usuarios || []).filter(u => u.parceiro_id === p.id).map(u => u.email),
      radios_ativas: carteira.filter(e => e.status === 'ativa').length,
      radios_teste: carteira.filter(e => e.status === 'trial').length,
    };
  }));
}

// POST { acao: 'criar', nome, comissao_pct }
//      { acao: 'atualizar', id, nome?, comissao_pct?, ativo?, logo_url? }
//      { acao: 'add_usuario' | 'remover_usuario', id, email }
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const db = supabaseAdmin();

  if (body.acao === 'criar') {
    if (!body.nome?.trim()) return NextResponse.json({ erro: 'Nome obrigatório.' }, { status: 422 });
    const { data, error } = await db.from('parceiros')
      .insert({ nome: body.nome.trim(), comissao_pct: Number(body.comissao_pct ?? 40) }).select().single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  if (!body.id) return NextResponse.json({ erro: 'id obrigatório.' }, { status: 422 });

  if (body.acao === 'atualizar') {
    const patch: Record<string, any> = {};
    for (const campo of ['nome', 'comissao_pct', 'ativo', 'logo_url']) if (campo in body) patch[campo] = body[campo];
    if ('comissao_pct' in patch) {
      const pct = Number(patch.comissao_pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ erro: 'Comissão precisa estar entre 0 e 100%.' }, { status: 422 });
      patch.comissao_pct = pct;
    }
    const { error } = await db.from('parceiros').update(patch).eq('id', body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email.includes('@')) return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 422 });

  if (body.acao === 'add_usuario') {
    const { error } = await db.from('parceiro_usuarios').upsert({ parceiro_id: body.id, email }, { onConflict: 'parceiro_id,email' });
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === 'remover_usuario') {
    const { error } = await db.from('parceiro_usuarios').delete().eq('parceiro_id', body.id).eq('email', email);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
}
