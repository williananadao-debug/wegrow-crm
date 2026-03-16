import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarJsonOpec } from '@/lib/opecIntegration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 🔒 A NOSSA CHAVE MESTRA (A que a equipa da OPEC vai usar)
const NOSSO_TOKEN_SECRETO = "WEGROW_OPEC_2026_MASTER_KEY";

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    
    if (authHeader !== `Bearer ${NOSSO_TOKEN_SECRETO}`) {
        return NextResponse.json({ erro: "Acesso Negado. Token inválido." }, { status: 401 });
    }

    try {
        // Robô VIP ativado
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );

        // 1. Busca APENAS os Jobs Finalizados
        const { data: jobsProntos } = await supabaseAdmin
            .from('jobs')
            .select('*')
            .eq('stage', 'entregue')
            .order('created_at', { ascending: false })
            .limit(100);

        if (!jobsProntos || jobsProntos.length === 0) {
            return NextResponse.json([], { status: 200 }); 
        }

        let contratosParaOpec = [];

        // 2. Monta o SUPER JSON limpo
        for (const job of jobsProntos) {
            let leadData = null;
            let clienteData = null;

            if (job.client_id) {
                const { data: lData } = await supabaseAdmin.from('leads').select('*').eq('client_id', job.client_id).order('created_at', { ascending: false }).limit(1).single();
                if(lData) leadData = lData;
                
                const { data: cData } = await supabaseAdmin.from('clientes').select('*').eq('id', job.client_id).single();
                if(cData) clienteData = cData;
            }

            let opecData = [{}];
            try {
                 if(leadData) opecData = gerarJsonOpec(leadData, clienteData || {}, { nome: job.vendedor_nome });
            } catch(e) {}
            
            const pacoteFinal = {
                ...opecData[0], 

                producao: {
                    id_job: job.id,
                    titulo_referencia: job.titulo,
                    status: job.stage,
                    prioridade: job.prioridade,
                    deadline_producao: job.deadline,
                    data_criacao_job: job.created_at,
                    data_liberacao_opec: new Date().toISOString(),
                    arquivo_audio_url: job.audio_url || null,
                    roteiro_locucao: job.briefing 
                },

                veiculacao: {
                    num_pi: job.num_pi || leadData?.num_pi || null,
                    data_inicio: job.data_inicio || leadData?.contrato_inicio || null,
                    data_fim: job.data_fim || leadData?.contrato_fim || null,
                    hora_inicio: job.hora_inicio || null,
                    hora_fim: job.hora_fim || null,
                    tabela_unidade: job.unidade || leadData?.unidade || 'Não informada',
                    itens_midia: job.itens_opec || leadData?.itens || []
                },

                comercial: {
                    id_lead: leadData?.id || null,
                    codigo_contrato: leadData ? `LD-${String(leadData.id).padStart(4, '0')}` : null,
                    vendedor: job.vendedor_nome || leadData?.vendedor_nome || 'Não informado',
                    valor_total: leadData?.valor_total || 0,
                    desconto_aplicado: leadData?.desconto || 0,
                    parcelas: leadData?.parcelas || 1,
                    primeiro_vencimento: leadData?.vencimento || null,
                },

                cliente: {
                    id_cliente: clienteData?.id || job.client_id || null,
                    nome_fantasia: job.cliente || clienteData?.nome_empresa || leadData?.empresa || 'Não Informado',
                    razao_social: clienteData?.nome_empresa || leadData?.empresa || 'Não Informado',
                    cnpj: clienteData?.cnpj || leadData?.cnpj || null,
                    telefone_whatsapp: clienteData?.telefone || leadData?.telefone || null,
                    cidade: clienteData?.cidade || leadData?.cidade || null,
                    agencia: job.agencia || (leadData?.tipo === 'Agência' ? leadData?.empresa : null)
                }
            };

            contratosParaOpec.push(pacoteFinal);
        }

        return NextResponse.json(contratosParaOpec, { status: 200 });

    } catch (error) {
        console.error("Erro na API OPEC:", error);
        return NextResponse.json({ erro: "Erro interno no servidor do CRM." }, { status: 500 });
    }
}