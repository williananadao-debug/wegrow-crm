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

export async function GET(request: Request) {
    if (!await verificarAdmin(request))
        return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresa_id');
    if (!empresaId) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 400 });

    const db = supabaseAdmin();
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
    const ha30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
        { count: totalLeads },
        { count: leadsMes },
        { count: leadsGanhosMes },
        { data: profiles },
    ] = await Promise.all([
        db.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
        db.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).gte('created_at', inicioMes),
        db.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'ganho').gte('created_at', inicioMes),
        db.from('profiles').select('id, nome, cargo, unidade, email').eq('empresa_id', empresaId),
    ]);

    // Busca last_sign_in_at dos usuários via auth admin API
    const profilesComLogin = await Promise.all(
        (profiles || []).map(async (p) => {
            const { data: { user } } = await db.auth.admin.getUserById(p.id);
            return {
                ...p,
                ultimo_acesso: user?.last_sign_in_at || null,
                ativo_recente: user?.last_sign_in_at ? new Date(user.last_sign_in_at) >= new Date(ha30dias) : false,
            };
        })
    );

    const usuariosAtivos = profilesComLogin.filter(p => p.ativo_recente).length;

    return NextResponse.json({
        total_leads: totalLeads ?? 0,
        leads_mes: leadsMes ?? 0,
        leads_ganhos_mes: leadsGanhosMes ?? 0,
        total_usuarios: (profiles || []).length,
        usuarios_ativos: usuariosAtivos,
        profiles: profilesComLogin,
    });
}
