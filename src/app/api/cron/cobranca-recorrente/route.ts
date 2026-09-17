import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function asaasBase(ambiente: string) {
    return ambiente === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}

// Antes usava a ASAAS_API_KEY global (da própria WeGrow) pra TODO lead de TODA empresa —
// cobrança recorrente de cliente de qualquer tenant caía na conta Asaas da WeGrow. Agora
// busca a chave própria de cada empresa (financeiro_integracoes); lead de empresa sem
// chave configurada é pulado, não gera cobrança nenhuma (ver loop principal abaixo).
async function asaas(apiKey: string, ambiente: string, method: string, path: string, body?: any) {
    const res = await fetch(`${asaasBase(ambiente)}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'access_token': apiKey,
            'User-Agent': 'WeGrow-CRM/1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
        const msg = data.errors?.[0]?.description || JSON.stringify(data);
        throw new Error(msg);
    }
    return data;
}

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// Gerado 1x por mês (ver vercel.json) pra todo contrato ganho com mais de 1
// parcela: cria a cobrança Asaas (boleto) da parcela do mês, sem precisar do
// vendedor lembrar de clicar "Gerar Cobrança" manualmente todo mês.
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
    }
    const supabase = db();
    const { data: integracoes } = await supabase.from('financeiro_integracoes').select('empresa_id, asaas_api_key, ambiente');
    const integracaoPorEmpresa = new Map((integracoes || []).map(i => [i.empresa_id, i]));
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

    const { data: leads, error } = await supabase
        .from('leads')
        .select('id, empresa, valor_total, parcelas, vencimento, vencimentos_datas, cnpj, client_id, empresa_id, cobrancas_recorrentes')
        .eq('status', 'ganho')
        .not('parcelas', 'is', null);

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    const resultados: any[] = [];

    for (const lead of leads || []) {
        const qtdParcelas = parseInt(String(lead.parcelas), 10) || 1;
        if (qtdParcelas <= 1) continue;

        const cobrancasExistentes: any[] = Array.isArray(lead.cobrancas_recorrentes) ? lead.cobrancas_recorrentes : [];
        if (cobrancasExistentes.some(c => c.mes === mesAtual)) continue;

        const datas = Array.isArray(lead.vencimentos_datas) && lead.vencimentos_datas.length === qtdParcelas
            ? lead.vencimentos_datas
            : null;
        const temParcelaEsteMes = datas ? datas.some((d: string) => d?.substring(0, 7) === mesAtual) : true;
        if (!temParcelaEsteMes) continue;

        if (!lead.cnpj) {
            resultados.push({ lead: lead.id, empresa: lead.empresa, status: 'pulado', motivo: 'sem CNPJ/CPF cadastrado' });
            continue;
        }

        const integracao = lead.empresa_id ? integracaoPorEmpresa.get(lead.empresa_id) : null;
        if (!integracao?.asaas_api_key) {
            resultados.push({ lead: lead.id, empresa: lead.empresa, status: 'pulado', motivo: 'empresa sem conta Asaas própria conectada' });
            continue;
        }

        const valorParcela = Number(((Number(lead.valor_total) || 0) / qtdParcelas).toFixed(2));
        if (valorParcela <= 0) continue;

        let email: string | undefined;
        if (lead.client_id) {
            const { data: cliente } = await supabase.from('clientes').select('email').eq('id', lead.client_id).single();
            email = cliente?.email || undefined;
        }

        try {
            const cpfCnpjClean = String(lead.cnpj).replace(/\D/g, '');
            const search = await asaas(integracao.asaas_api_key, integracao.ambiente, 'GET', `/customers?cpfCnpj=${cpfCnpjClean}`);
            let customerId: string;
            if (search.data?.length > 0) {
                customerId = search.data[0].id;
            } else {
                const cliente = await asaas(integracao.asaas_api_key, integracao.ambiente, 'POST', '/customers', { name: lead.empresa, cpfCnpj: cpfCnpjClean, ...(email ? { email } : {}) });
                customerId = cliente.id;
            }

            const vencimentoParcela = datas?.find((d: string) => d?.substring(0, 7) === mesAtual) || `${mesAtual}-05`;
            const payment = await asaas(integracao.asaas_api_key, integracao.ambiente, 'POST', '/payments', {
                customer: customerId,
                billingType: 'BOLETO',
                value: valorParcela,
                dueDate: vencimentoParcela,
                description: `Cobrança recorrente — ${lead.empresa} (${mesAtual})`,
                externalReference: String(lead.id),
            });

            const novaCobranca = {
                mes: mesAtual,
                asaas_payment_id: payment.id,
                valor: valorParcela,
                gerado_em: new Date().toISOString(),
                invoiceUrl: payment.invoiceUrl || null,
            };
            await supabase.from('leads')
                .update({ cobrancas_recorrentes: [...cobrancasExistentes, novaCobranca] })
                .eq('id', lead.id);

            await supabase.from('lancamentos').insert([{
                titulo: `RECORRENTE: ${lead.empresa} - OS: LD-${String(lead.id).padStart(4, '0')} (${mesAtual})`,
                valor: valorParcela,
                tipo: 'entrada',
                categoria: 'vendas',
                status: 'pendente',
                data_vencimento: vencimentoParcela,
                empresa_id: lead.empresa_id,
            }]);

            resultados.push({ lead: lead.id, empresa: lead.empresa, status: 'gerado', paymentId: payment.id, valor: valorParcela });
        } catch (err: any) {
            console.error('[cron/cobranca-recorrente]', lead.id, err.message);
            Sentry.captureException(err, { tags: { cron: 'cobranca-recorrente' }, extra: { leadId: lead.id, empresa: lead.empresa } });
            resultados.push({ lead: lead.id, empresa: lead.empresa, status: 'erro', motivo: err.message });
        }
    }

    return NextResponse.json({ ok: true, mes: mesAtual, processados: resultados.length, resultados });
}
