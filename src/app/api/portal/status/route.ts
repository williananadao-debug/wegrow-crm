import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(Number(id))) {
        return NextResponse.json({ erro: 'ID inválido.' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data, error } = await supabaseAdmin
        .from('leads')
        .select('id, empresa, status, etapa, created_at, origem')
        .eq('id', Number(id))
        .eq('origem', 'Portal Web')
        .single();

    if (error || !data) {
        return NextResponse.json({ erro: 'Solicitação não encontrada.' }, { status: 404 });
    }

    const ETAPAS: Record<number, string> = {
        0: 'Solicitação recebida',
        1: 'Em análise pela equipe comercial',
        2: 'Proposta sendo elaborada',
        3: 'Em negociação',
        4: 'Finalizado',
        5: 'Não seguiu em frente',
    };

    return NextResponse.json({
        id: data.id,
        empresa: data.empresa,
        status: data.status,
        etapa: data.etapa,
        etapaDescricao: ETAPAS[data.etapa] ?? 'Em andamento',
        criadoEm: data.created_at,
    });
}
