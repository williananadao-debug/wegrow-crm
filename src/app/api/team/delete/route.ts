import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.replace('Bearer ', '');

    if (!accessToken) {
        return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: { user: solicitante }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !solicitante) {
        return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });
    }

    const { data: perfilSolicitante } = await supabaseAdmin
        .from('profiles')
        .select('cargo, empresa_id')
        .eq('id', solicitante.id)
        .single();

    if (perfilSolicitante?.cargo !== 'diretor') {
        return NextResponse.json({ erro: 'Acesso restrito a diretores.' }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
        return NextResponse.json({ erro: 'userId obrigatório.' }, { status: 422 });
    }

    // Impede que o diretor se exclua
    if (userId === solicitante.id) {
        return NextResponse.json({ erro: 'Você não pode excluir sua própria conta.' }, { status: 400 });
    }

    // Verifica se o usuário pertence à mesma empresa
    const { data: perfilAlvo } = await supabaseAdmin
        .from('profiles')
        .select('empresa_id')
        .eq('id', userId)
        .single();

    if (perfilAlvo?.empresa_id !== perfilSolicitante.empresa_id) {
        return NextResponse.json({ erro: 'Usuário não pertence à sua empresa.' }, { status: 403 });
    }

    // Usuário com histórico não é apagado: metas iriam junto (FK em cascata) e leads/visitas
    // perderiam o vendedor nos relatórios. Nesse caso o caminho é desativar.
    const contar = (tabela: string, coluna: string) =>
        supabaseAdmin.from(tabela).select('id', { count: 'exact', head: true }).eq(coluna, userId).then(r => r.count || 0);
    const [leadsDono, leadsCriados, visitas, metas] = await Promise.all([
        contar('leads', 'user_id'), contar('leads', 'criado_por'), contar('visitas', 'user_id'), contar('metas', 'user_id'),
    ]);
    if (leadsDono + leadsCriados + visitas + metas > 0) {
        return NextResponse.json({
            erro: `Esse usuário tem histórico (${leadsDono + leadsCriados} lead(s), ${visitas} visita(s), ${metas} meta(s)). Apagar faria esse histórico perder o dono — use "Desativar usuário": o acesso é cortado e o histórico fica.`,
            temHistorico: true,
        }, { status: 409 });
    }

    // Login primeiro: se falhar, o perfil continua e nada fica pela metade.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
        console.error('[team/delete] Erro ao excluir usuário:', deleteError.message);
        return NextResponse.json({ erro: `Erro ao excluir usuário: ${deleteError.message}` }, { status: 500 });
    }
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    return NextResponse.json({ ok: true });
}
