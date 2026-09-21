import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { montarPacotesOpec } from '@/lib/opecPacotes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NOSSO_TOKEN_SECRETO = process.env.TOKEN_INTEGRACAO_OPEC;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    
    if (authHeader !== `Bearer ${NOSSO_TOKEN_SECRETO}`) {
        return NextResponse.json({ erro: "Acesso Negado. Token inválido." }, { status: 401 });
    }

    // 🔍 Capturando os filtros da OPEC
    const dataInicial = searchParams.get('data_inicial'); 
    const dataFinal = searchParams.get('data_final');     
    const status = searchParams.get('status') || 'entregue'; 
    const idJob = searchParams.get('id');
    const numeroContrato = searchParams.get('numero_contrato'); 
    
    const codigoEmissora = searchParams.get('codigo_emissora');

    // codigo_emissora é obrigatório — sem ele não entregamos dados de nenhum tenant
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!codigoEmissora || !UUID_REGEX.test(codigoEmissora)) {
        return NextResponse.json({ erro: "Parâmetro 'codigo_emissora' obrigatório e deve ser um UUID válido." }, { status: 400 });
    }

    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );
        const contratosParaOpec = await montarPacotesOpec(supabaseAdmin, { codigoEmissora, status, dataInicial, dataFinal, idJob, numeroContrato });
        return NextResponse.json(contratosParaOpec, { status: 200 });

    } catch (error) {
        console.error("Erro na API OPEC:", error);
        return NextResponse.json({ erro: "Erro interno no servidor do CRM." }, { status: 500 });
    }
}