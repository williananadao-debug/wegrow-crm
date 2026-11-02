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

// GET ?parceiro_id= &empresa_id= &limite= — últimas ações registradas (lib/auditoria), com o
// nome da empresa e do parceiro.
export async function GET(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  const db = supabaseAdmin();
  const q = new URL(request.url).searchParams;
  const limite = Math.min(Number(q.get('limite')) || 50, 200);

  let query = db.from('auditoria').select('*').order('criado_em', { ascending: false }).limit(limite);
  if (q.get('parceiro_id')) query = query.eq('parceiro_id', q.get('parceiro_id'));
  if (q.get('empresa_id')) query = query.eq('empresa_id', q.get('empresa_id'));
  const { data, error } = await query;
  if (error) return NextResponse.json({ registros: [], aviso: 'Rode a migration 20261102120000_auditoria.sql para ativar o registro.' });

  const empresaIds = [...new Set((data || []).map(r => r.empresa_id).filter(Boolean))];
  const parceiroIds = [...new Set((data || []).map(r => r.parceiro_id).filter(Boolean))];
  const [{ data: empresas }, { data: parceiros }] = await Promise.all([
    empresaIds.length ? db.from('empresas').select('id, nome').in('id', empresaIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    parceiroIds.length ? db.from('parceiros').select('id, nome').in('id', parceiroIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const emp = new Map((empresas || []).map(e => [e.id, e.nome]));
  const par = new Map((parceiros || []).map(p => [p.id, p.nome]));
  return NextResponse.json({
    registros: (data || []).map(r => ({ ...r, empresa_nome: r.empresa_id ? emp.get(r.empresa_id) || null : null, parceiro_nome: r.parceiro_id ? par.get(r.parceiro_id) || null : null })),
  });
}
