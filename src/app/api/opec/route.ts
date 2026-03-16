import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarJsonOpec } from '@/lib/opecIntegration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NOSSO_TOKEN_SECRETO = "WEGROW_OPEC_2026_MASTER_KEY";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    
    // 🛡️ Segurança básica
    if (authHeader !== `Bearer ${NOSSO_TOKEN_SECRETO}`) {
        return NextResponse.json({ erro: "Acesso Negado." }, { status: 401 });
    }

    // 🔍 Capturando os novos filtros da URL
    const dataInicial = searchParams.get('data_inicial'); // Ex: 2025-11-27
    const dataFinal = searchParams.get('data_final');     // Ex: 2025-11-28
    const status = searchParams.get('status') || 'entregue'; 
    const idJob = searchParams.get('id');

    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );

        // 1. Montando a Query Dinâmica
        let query = supabaseAdmin.from('jobs').select('*');

        // Filtro por ID específico (se houver)
        if (idJob) {
            query = query.eq('id', idJob);
        } else {
            // Filtros gerais
            query = query.eq('stage', status);
            
            if (dataInicial) {
                query = query.gte('created_at', dataInicial);
            }
            if (dataFinal) {
                // Adicionamos as 23:59:59 para pegar o dia inteiro
                query = query.lte('created_at', `${dataFinal}T23:59:59`);
            }
        }

        const { data: jobsProntos, error: queryError } = await query
            .order('created_at', { ascending: false })
            .limit(200);

        if (queryError) throw queryError;
        if (!jobsProntos || jobsProntos.length === 0) return NextResponse.json([]);

        // 2. Processamento dos dados (Mesma lógica anterior)
        let contratosParaOpec = [];

        for (const job of jobsProntos) {
            let leadData = null;
            let clienteData = null;

            if (job.client_id) {
                const { data: lData } = await supabaseAdmin.from('leads').select('*').eq('client_id', job.client_id).limit(1).maybeSingle();
                if(lData) leadData = lData;
                
                const { data: cData } = await supabaseAdmin.from('clientes').select('*').eq('id', job.client_id).maybeSingle();
                if(cData) clienteData = cData;
            }

            let opecData: any[] = [{}];
            try {
                 if(leadData) opecData = gerarJsonOpec(leadData, clienteData || {}, { nome: job.vendedor_nome });
            } catch(e) {}
            
            contratosParaOpec.push({
                ...opecData[0],
                producao: {
                    id_job: job.id,
                    status: job.stage,
                    data_criacao: job.created_at,
                    arquivo_audio_url: job.audio_url || null,
                    roteiro: job.briefing 
                },
                veiculacao: {
                    num_pi: job.num_pi || leadData?.num_pi || null,
                    data_inicio: job.data_inicio || leadData?.contrato_inicio || null,
                    data_fim: job.data_fim || leadData?.contrato_fim || null,
                },
                comercial: {
                    vendedor: job.vendedor_nome || leadData?.vendedor_nome || 'Não informado',
                    valor_total: leadData?.valor_total || 0,
                },
                cliente: {
                    nome: job.cliente || clienteData?.nome_empresa || 'Não Informado',
                    cnpj: clienteData?.cnpj || leadData?.cnpj || null,
                }
            });
        }

        return NextResponse.json(contratosParaOpec, { status: 200 });

    } catch (error) {
        console.error("Erro API OPEC:", error);
        return NextResponse.json({ erro: "Erro ao buscar dados." }, { status: 500 });
    }
}