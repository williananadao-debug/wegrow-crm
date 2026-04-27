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

    await supabaseAdmin.from('profiles').delete().eq('id', userId);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error('[team/delete] Erro ao excluir usuário:', deleteError.message);
        return NextResponse.json({ erro: 'Erro ao excluir usuário.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
