import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarJsonOpec } from '@/lib/opecIntegration';

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
    
    // 👇 NOVIDADE: Filtro pela Rádio (Emissora) Cliente 👇
    const codigoEmissora = searchParams.get('codigo_emissora'); 

    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );

        let query = supabaseAdmin.from('jobs').select('*');

        // 👇 NOVIDADE: Trava de segurança para multi-clientes 👇
        // Se a OPEC mandar o código da emissora, filtramos só para ela!
        if (codigoEmissora) {
            query = query.eq('empresa_id', codigoEmissora);
        }

        // 🚦 LÓGICA DE FILTROS INTELIGENTES
        if (numeroContrato) {
            const idLimpo = numeroContrato.replace(/\D/g, '');
            const { data: leadReferencia } = await supabaseAdmin
                .from('leads')
                .select('client_id')
                .eq('id', idLimpo)
                .single();

            if (leadReferencia && leadReferencia.client_id) {
                query = query.eq('client_id', leadReferencia.client_id);
            } else {
                return NextResponse.json([], { status: 200 }); 
            }
        } 
        else if (idJob) {
            query = query.eq('id', idJob);
        } 
        else {
            query = query.eq('stage', status);
            if (dataInicial) query = query.gte('created_at', dataInicial);
            if (dataFinal) query = query.lte('created_at', `${dataFinal}T23:59:59`);
        }

        const { data: jobsProntos } = await query
            .order('created_at', { ascending: false })
            .limit(100);

        if (!jobsProntos || jobsProntos.length === 0) {
            return NextResponse.json([], { status: 200 }); 
        }

        let contratosParaOpec = [];

        // Monta o SUPER JSON
        for (const job of jobsProntos) {
            let leadData = null;
            let clienteData = null;

            if (job.client_id) {
                const { data: lData } = await supabaseAdmin.from('leads').select('*').eq('client_id', job.client_id).order('created_at', { ascending: false }).limit(1).single();
                if(lData) leadData = lData;
                
                const { data: cData } = await supabaseAdmin.from('clientes').select('*').eq('id', job.client_id).single();
                if(cData) clienteData = cData;
            }

            let opecData: any[] = [{}];
            try {
                 if(leadData) opecData = gerarJsonOpec(leadData, clienteData || {}, { nome: job.vendedor_nome });
            } catch(e) {}
            
            const pacoteFinal = {
                ...opecData[0], 
                // 👇 NOVIDADE: Identificação de quem é o dono do dado 👇
                origem: {
                    codigo_emissora: job.empresa_id || null,
                    sistema_gerador: "WeGrow CRM",
                    ambiente: "producao"
                },
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