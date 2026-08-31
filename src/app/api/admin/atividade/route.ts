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

// GET — atividade cross-tenant da plataforma toda: agregado + quebra por empresa
// (usuários ativos, leads do mês, último acesso), além dos últimos logins.
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();
  const ha7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: profiles },
    { data: empresasData },
    { data: leadsStats },
    { data: authData },
  ] = await Promise.all([
    db.from('profiles').select('id, nome, email, empresa_id'),
    db.from('empresas').select('id, nome, status'),
    db.rpc('admin_leads_stats'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const authMap = new Map((authData?.users || []).map(u => [u.id, u]));
  const empresaNomeMap = new Map((empresasData || []).map(e => [e.id, e.nome]));
  const leadsStatsMap = new Map<string, { total: number; mes: number }>(
    (leadsStats || []).map((s: any) => [s.empresa_id, { total: Number(s.leads_total), mes: Number(s.leads_mes) }])
  );

  const comLogin = (profiles || [])
    .map(p => {
      const u = authMap.get(p.id);
      return {
        nome: p.nome || p.email || 'Sem nome',
        empresa_id: p.empresa_id,
        empresa: p.empresa_id ? (empresaNomeMap.get(p.empresa_id) || '—') : '—',
        ultimo_acesso: u?.last_sign_in_at || null,
      };
    })
    .filter(p => p.ultimo_acesso)
    .sort((a, b) => new Date(b.ultimo_acesso!).getTime() - new Date(a.ultimo_acesso!).getTime());

  const usuariosAtivos7d = comLogin.filter(p => new Date(p.ultimo_acesso!) >= new Date(ha7dias)).length;

  // Quebra por empresa
  const porEmpresa = (empresasData || []).map(e => {
    const usuariosDaEmpresa = comLogin.filter(p => p.empresa_id === e.id);
    const totalUsuariosEmpresa = (profiles || []).filter(p => p.empresa_id === e.id).length;
    const stats = leadsStatsMap.get(e.id);
    return {
      id: e.id,
      nome: e.nome,
      status: e.status,
      total_usuarios: totalUsuariosEmpresa,
      usuarios_ativos_7d: usuariosDaEmpresa.filter(p => new Date(p.ultimo_acesso!) >= new Date(ha7dias)).length,
      leads_mes: stats?.mes || 0,
      leads_total: stats?.total || 0,
      ultimo_acesso: usuariosDaEmpresa[0]?.ultimo_acesso ?? null,
    };
  }).sort((a, b) => {
    if (!a.ultimo_acesso && !b.ultimo_acesso) return 0;
    if (!a.ultimo_acesso) return 1;
    if (!b.ultimo_acesso) return -1;
    return new Date(b.ultimo_acesso).getTime() - new Date(a.ultimo_acesso).getTime();
  });

  const leadsMesTotal = Array.from(leadsStatsMap.values()).reduce((s, v) => s + v.mes, 0);

  return NextResponse.json({
    leads_mes: leadsMesTotal,
    usuarios_ativos_7d: usuariosAtivos7d,
    ultimos_logins: comLogin.slice(0, 8),
    por_empresa: porEmpresa,
  });
}
