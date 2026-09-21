import { SupabaseClient } from '@supabase/supabase-js';
import { gerarJsonOpec } from '@/lib/opecIntegration';

// Monta os pacotes que a API /api/opec entrega pra OPEC. Fica aqui (e não dentro da rota)
// pra a tela de validação do admin (/admin/opec) enxergar EXATAMENTE o mesmo dado que a OPEC
// recebe — qualquer ajuste no formato vale pros dois.
export type FiltrosOpec = {
  codigoEmissora: string; status?: string; dataInicial?: string | null; dataFinal?: string | null;
  idJob?: string | null; numeroContrato?: string | null;
};

export async function montarPacotesOpec(supabaseAdmin: SupabaseClient, f: FiltrosOpec): Promise<any[]> {
    const codigoEmissora = f.codigoEmissora;
    const status = f.status || 'entregue';
    const dataInicial = f.dataInicial || null;
    const dataFinal = f.dataFinal || null;
    const idJob = f.idJob || null;
    const numeroContrato = f.numeroContrato || null;

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
                return [];
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
            return [];
        }

        let contratosParaOpec = [];

        // Batch: busca todos leads e clientes de uma vez (evita N+1)
        const clientIds = [...new Set(jobsProntos.map(j => j.client_id).filter(Boolean))];
        let leadsMap: Record<number, any> = {};
        let clientesMap: Record<number, any> = {};

        // Load OPEC config from unidades table
        const { data: unidadesData } = await supabaseAdmin
            .from('unidades')
            .select('nome, config_opec')
            .eq('empresa_id', codigoEmissora);

        const configEmissoras: Record<string, any> = {};
        (unidadesData || []).forEach((u: any) => {
            if (u.config_opec && u.nome) configEmissoras[u.nome] = u.config_opec;
        });
        const finalConfig = Object.keys(configEmissoras).length > 0 ? configEmissoras : undefined;

        // Job → lead pelo "Ref: LD-####" gravado no briefing na hora que a venda fecha. Antes
        // todo job pegava o lead MAIS RECENTE do cliente (leadsMap), o que entregava dados de
        // outro contrato pra cliente com mais de uma venda (validação 21/09/2026: 34 de 88 jobs
        // entregues vinham com o contrato errado). O lead mais recente segue como fallback.
        const idsRef = [...new Set(jobsProntos
            .map(j => Number(/Ref:\s*LD-0*(\d+)/i.exec(j.briefing || '')?.[1]))
            .filter(n => Number.isFinite(n) && n > 0))];
        const leadPorRef: Record<number, any> = {};
        if (idsRef.length > 0) {
            const { data: leadsRef } = await supabaseAdmin.from('leads').select('*').eq('empresa_id', codigoEmissora).in('id', idsRef);
            (leadsRef || []).forEach(l => { leadPorRef[l.id] = l; });
        }

        // CPF do vendedor (o gabarito exige; antes ia sempre o placeholder 000.000.000-00)
        const { data: perfisData } = await supabaseAdmin.from('profiles').select('nome, cpf').eq('empresa_id', codigoEmissora);
        const norm = (t: string) => (t || '').trim().toLowerCase();
        const cpfPorNome: Record<string, string> = {};
        (perfisData || []).forEach((pf: any) => { if (pf.nome && pf.cpf) cpfPorNome[norm(pf.nome)] = pf.cpf; });

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
            const refId = Number(/Ref:\s*LD-0*(\d+)/i.exec(job.briefing || '')?.[1]);
            // Briefing aponta pra um contrato (Ref: LD-####) que não existe mais: NÃO cai no "lead mais
            // recente do cliente" — isso entregava os dados de OUTRO contrato como se fossem desse job.
            // Só usa o fallback quando o briefing não tem referência (jobs antigos/manuais).
            const temRef = Number.isFinite(refId) && refId > 0;
            const leadData = temRef ? (leadPorRef[refId] || null) : (job.client_id ? (leadsMap[job.client_id] || null) : null);
            const clienteData = job.client_id ? (clientesMap[job.client_id] || null) : null;

            let opecData: any[] = [{}];
            try {
                 // leadsMap guarda só 1 lead por client_id (o mais recente) — cliente com
                 // job em mais de uma rádio ia usar a unidade desse lead "genérico" pra
                 // identificar a emissora em TODOS os jobs dele, mesmo os de outra rádio.
                 // job.unidade é o dado certo (é do próprio job), tem prioridade aqui.
                 if (leadData) {
                     const leadParaOpec = { ...leadData, unidade: job.unidade || leadData.unidade };
                     const nomeVendedor = job.vendedor_nome || leadData.vendedor_nome;
                     opecData = gerarJsonOpec(leadParaOpec, clienteData || {}, { nome: nomeVendedor, cpf: cpfPorNome[norm(nomeVendedor)] }, finalConfig);
                 }
            } catch(e) { console.error('[opec] gerarJsonOpec error:', e); }
            
            const pacoteFinal = {
                ...opecData[0],
                // Job sem lead vinculado não tem contrato pra montar o gabarito — sinaliza em vez
                // de entregar um pacote sem os campos raiz sem explicação.
                ...(leadData ? {} : { dados_incompletos: true, aviso: temRef ? `Contrato LD-${String(refId).padStart(4, '0')} referenciado no briefing não existe mais — campos do gabarito OPEC indisponíveis.` : 'Job sem contrato (lead) vinculado — campos do gabarito OPEC indisponíveis.' }),
                // 👇 NOVIDADE: Identificação de quem é o dono do dado 👇
                origem: {
                    codigo_emissora: job.empresa_id || null,
                    sistema_gerador: "WeGrow",
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

        return contratosParaOpec;
}
