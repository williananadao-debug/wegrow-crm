import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ETAPAS: Record<number, string> = {
    0: 'Pré-cadastro recebido',
    1: 'Em análise pela equipe CDL',
    2: 'Proposta de Filiação enviada',
    3: 'Em negociação',
    4: 'Filiado!',
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

    if (id) {
        if (isNaN(Number(id))) return NextResponse.json({ erro: 'ID inválido.' }, { status: 400 });
        const { data, error } = await db
            .from('leads')
            .select('id, empresa, status, etapa, created_at')
            .eq('id', Number(id))
            .eq('origem', 'Portal CDL')
            .single();
        if (error || !data) return NextResponse.json({ erro: 'Protocolo não encontrado.' }, { status: 404 });
        return NextResponse.json(formatLead(data));
    }

    if (busca) {
        const termo = busca.replace(/\D/g, '');
        const { data, error } = await db
            .from('leads')
            .select('id, empresa, status, etapa, created_at, cnpj, telefone')
            .eq('origem', 'Portal CDL')
            .or(`cnpj.ilike.%${termo}%,telefone.ilike.%${busca}%`)
            .order('created_at', { ascending: false })
            .limit(5);
        if (error || !data?.length) return NextResponse.json({ erro: 'Nenhum cadastro encontrado com esses dados.' }, { status: 404 });
        return NextResponse.json(data.map(formatLead));
    }

    return NextResponse.json({ erro: 'Informe id ou busca.' }, { status: 400 });
}
