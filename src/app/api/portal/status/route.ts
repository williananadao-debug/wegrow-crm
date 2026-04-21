import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ETAPAS: Record<number, string> = {
    0: 'Solicitação recebida',
    1: 'Em análise pela equipe comercial',
    2: 'Proposta sendo elaborada',
    3: 'Em negociação',
    4: 'Finalizado',
    5: 'Não seguiu em frente',
};

function formatLead(data: any) {
    return {
        id: data.id,
        empresa: data.empresa,
        status: data.status,
        etapa: data.etapa,
        etapaDescricao: ETAPAS[data.etapa] ?? 'Em andamento',
        criadoEm: data.created_at,
    };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const busca = searchParams.get('busca')?.trim();

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    // Busca por protocolo
    if (id) {
        if (isNaN(Number(id))) {
            return NextResponse.json({ erro: 'ID inválido.' }, { status: 400 });
        }
        const { data, error } = await db
            .from('leads')
            .select('id, empresa, status, etapa, created_at')
            .eq('id', Number(id))
            .eq('origem', 'Portal Web')
            .single();
        if (error || !data) {
            return NextResponse.json({ erro: 'Solicitação não encontrada.' }, { status: 404 });
        }
        return NextResponse.json(formatLead(data));
    }

    // Busca por CNPJ ou telefone
    if (busca) {
        const termo = busca.replace(/\D/g, '');
        const { data, error } = await db
            .from('leads')
            .select('id, empresa, status, etapa, created_at, cnpj, telefone')
            .eq('origem', 'Portal Web')
            .or(`cnpj.ilike.%${termo}%,telefone.ilike.%${busca}%`)
            .order('created_at', { ascending: false })
            .limit(5);
        if (error || !data?.length) {
            return NextResponse.json({ erro: 'Nenhuma solicitação encontrada com esses dados.' }, { status: 404 });
        }
        return NextResponse.json(data.map(formatLead));
    }

    return NextResponse.json({ erro: 'Informe id ou busca.' }, { status: 400 });
}
