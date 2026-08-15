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

// GET — atividade cross-tenant da plataforma toda: últimos logins, usuários ativos
// nos últimos 7 dias e leads criados no mês corrente (soma de todas as empresas).
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  const ha7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: profiles },
    { data: empresasData },
    { count: leadsMes },
    { data: authData },
  ] = await Promise.all([
    db.from('profiles').select('id, nome, email, empresa_id'),
    db.from('empresas').select('id, nome'),
    db.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', inicioMes),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const empresaNomeMap = new Map((empresasData || []).map(e => [e.id, e.nome]));
  const authMap = new Map((authData?.users || []).map(u => [u.id, u]));

  const comLogin = (profiles || [])
    .map(p => {
      const u = authMap.get(p.id);
      return {
        nome: p.nome || p.email || 'Sem nome',
        empresa: p.empresa_id ? (empresaNomeMap.get(p.empresa_id) || '—') : '—',
        ultimo_acesso: u?.last_sign_in_at || null,
      };
    })
    .filter(p => p.ultimo_acesso)
    .sort((a, b) => new Date(b.ultimo_acesso!).getTime() - new Date(a.ultimo_acesso!).getTime());

  const usuariosAtivos7d = comLogin.filter(p => new Date(p.ultimo_acesso!) >= new Date(ha7dias)).length;

  return NextResponse.json({
    leads_mes: leadsMes ?? 0,
    usuarios_ativos_7d: usuariosAtivos7d,
    ultimos_logins: comLogin.slice(0, 8),
  });
}
