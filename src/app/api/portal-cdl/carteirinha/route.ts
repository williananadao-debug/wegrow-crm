import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(Number(id))) {
        return NextResponse.json({ erro: 'ID inválido.' }, { status: 400 });
    }

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data, error } = await db
        .from('leads')
        .select('id, empresa, tipo, contrato_inicio, contrato_fim, unidade, descricao, status, etapa')
        .eq('id', Number(id))
        .eq('status', 'ganho')
        .single();

    if (error || !data) {
        return NextResponse.json({ erro: 'Carteirinha não encontrada.' }, { status: 404 });
    }

    const segMatch = data.descricao?.match(/Segmento:\s*([^\n]+)/);
    const segmento = segMatch ? segMatch[1].trim() : null;

    return NextResponse.json({
        id: data.id,
        empresa: data.empresa,
        tipo: data.tipo || 'Associado',
        segmento,
        unidade: data.unidade,
        contrato_inicio: data.contrato_inicio,
        contrato_fim: data.contrato_fim,
        ativa: !data.contrato_fim || data.contrato_fim >= new Date().toISOString().substring(0, 10),
    });
}
