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

        let query = supabaseAdmin.from('jobs').select('id, titulo, stage, prioridade, deadline, created_at, audio_url, briefing, client_id, empresa_id, vendedor_nome, unidade, num_pi, data_inicio, data_fim, hora_inicio, hora_fim, itens_opec, agencia, cliente');
        query = query.eq('empresa_id', codigoEmissora);

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

        // Batch: busca todos leads e clientes de uma vez (evita N+1)
        const clientIds = [...new Set(jobsProntos.map(j => j.client_id).filter(Boolean))];
        let leadsMap: Record<number, any> = {};
        let clientesMap: Record<number, any> = {};

        if (clientIds.length > 0) {
            const [{ data: leadsData }, { data: clientesData }] = await Promise.all([
                supabaseAdmin.from('leads').select('*').in('client_id', clientIds).order('created_at', { ascending: false }),
                supabaseAdmin.from('clientes').select('*').in('id', clientIds),
            ]);
            if (leadsData) {
                leadsData.forEach(l => { if (!leadsMap[l.client_id]) leadsMap[l.client_id] = l; });
            }
            if (clientesData) {
                clientesData.forEach(c => { clientesMap[c.id] = c; });
            }
        }

        for (const job of jobsProntos) {
            const leadData = job.client_id ? (leadsMap[job.client_id] || null) : null;
            const clienteData = job.client_id ? (clientesMap[job.client_id] || null) : null;

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