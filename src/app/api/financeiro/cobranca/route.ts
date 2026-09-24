import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function asaasBase(ambiente: string) {
    return ambiente === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}

// Antes usava uma ASAAS_API_KEY global (a da própria WeGrow) — fazia boleto/Pix de
// QUALQUER empresa cair na conta Asaas da WeGrow em vez da conta da empresa dona da
// venda. Agora exige a chave própria de cada empresa (financeiro_integracoes), igual ao
// fiscal_integracoes do Focus NFe.
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

// https://docs.asaas.com/reference/payment-status-list — só os que fazem sentido aparecer
// pra quem usa o CRM (não é uma tradução técnica completa, é o texto que ajuda a decidir).
const STATUS_ASAAS_PT: Record<string, string> = {
    PENDING: 'Pendente', OVERDUE: 'Vencida', RECEIVED: 'Recebida', CONFIRMED: 'Confirmada',
    RECEIVED_IN_CASH: 'Recebida em dinheiro', REFUNDED: 'Estornada', REFUND_REQUESTED: 'Estorno solicitado',
    CHARGEBACK_REQUESTED: 'Chargeback solicitado', CHARGEBACK_DISPUTE: 'Em disputa de chargeback',
    AWAITING_CHARGEBACK_REVERSAL: 'Aguardando reversão de chargeback',
    DUNNING_REQUESTED: 'Em cobrança extrajudicial', DUNNING_RECEIVED: 'Recuperada via cobrança extrajudicial',
    AWAITING_RISK_ANALYSIS: 'Em análise de risco',
};

export async function POST(request: Request) {
    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!accessToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
    if (!user) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });

    const { data: perfil } = await supabaseAdmin.from('profiles').select('empresa_id').eq('id', user.id).single();
    if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });

    const { data: integracao } = await supabaseAdmin.from('financeiro_integracoes')
        .select('asaas_api_key, ambiente').eq('empresa_id', perfil.empresa_id).maybeSingle();
    if (!integracao?.asaas_api_key) {
        return NextResponse.json({ erro: 'Sua empresa ainda não conectou uma conta Asaas própria — configure em Configurações antes de gerar boleto/Pix. Sem isso, o dinheiro não cairia na sua conta.' }, { status: 400 });
    }
    const apiKey = integracao.asaas_api_key;
    const ambiente = integracao.ambiente;

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { leadId, nome, cpfCnpj, email, valor, vencimento, tipo, parcelas } = body;
    const faltando = [
        !leadId && 'leadId', !nome && 'nome', !cpfCnpj && 'cpfCnpj', !tipo && 'tipo',
    ].filter(Boolean);
    if (faltando.length > 0) {
        return NextResponse.json({ erro: `Campo(s) obrigatório(s) faltando: ${faltando.join(', ')}.` }, { status: 422 });
    }
    if (!['BOLETO', 'PIX'].includes(tipo)) {
        return NextResponse.json({ erro: 'tipo deve ser BOLETO ou PIX.' }, { status: 422 });
    }

    // Uma cobrança única (valor/vencimento no corpo) ou várias parcelas de uma vez
    // (array `parcelas`, uma cobrança Asaas por item) — mesmo formato internamente.
    const itensParcelas: { valor: number; vencimento: string }[] = Array.isArray(parcelas) && parcelas.length > 0
        ? parcelas
        : [{ valor: Number(valor), vencimento }];
    const parcelaInvalida = itensParcelas.find(p => !p.valor || !(Number(p.valor) > 0) || !p.vencimento);
    if (parcelaInvalida) {
        return NextResponse.json({ erro: 'Toda parcela precisa de valor e vencimento válidos.' }, { status: 422 });
    }

    // Salva no lead o que já foi gerado até aqui — mesmo padrão do cron de cobrança
    // recorrente (leads.cobrancas_recorrentes), em coluna própria. Chamado tanto no
    // sucesso quanto se uma parcela no meio do laço falhar: as anteriores já foram
    // criadas de verdade na Asaas, não pode perder o rastro delas por causa de uma
    // parcela seguinte que deu erro.
    const persistirCobrancas = async (resultados: any[]) => {
        if (resultados.length === 0) return;
        const { data: leadAtual } = await supabaseAdmin.from('leads').select('cobrancas_manuais').eq('id', leadId).single();
        const cobrancasExistentes = Array.isArray(leadAtual?.cobrancas_manuais) ? leadAtual.cobrancas_manuais : [];
        const novasCobrancas = resultados.map(r => ({
            asaasPaymentId: r.paymentId,
            parcela: r.parcela,
            tipo: r.tipo,
            valor: r.valor,
            vencimento: r.vencimento,
            geradoEm: new Date().toISOString(),
            invoiceUrl: r.invoiceUrl,
            bankSlipUrl: r.bankSlipUrl,
            linhaDigitavel: r.linhaDigitavel,
            pixPayload: r.pixPayload,
        }));
        await supabaseAdmin.from('leads')
            .update({ cobrancas_manuais: [...cobrancasExistentes, ...novasCobrancas] })
            .eq('id', leadId);
    };

    const resultados: any[] = [];
    try {
        const cpfCnpjClean = String(cpfCnpj).replace(/\D/g, '');

        // Busca ou cria cliente no Asaas — uma vez só, reaproveitado pra todas as parcelas
        const nomeUpper = String(nome || '').toLocaleUpperCase('pt-BR');
        let customerId: string;
        const search = await asaas(apiKey, ambiente, 'GET', `/customers?cpfCnpj=${cpfCnpjClean}`);
        if (search.data?.length > 0) {
            customerId = search.data[0].id;
            // Cliente já existia no Asaas (ex: de uma cobrança anterior com nome errado) —
            // normaliza o nome dele agora, senão o boleto continua saindo com o texto antigo
            // pra sempre, mesmo corrigindo o cadastro no CRM depois.
            if (search.data[0].name !== nomeUpper) {
                await asaas(apiKey, ambiente, 'POST', `/customers/${customerId}`, { name: nomeUpper }).catch(() => {});
            }
        } else {
            // Nome vai maiúsculo pro Asaas independente de como foi digitado no cadastro do
            // cliente — sem isso, um cliente cadastrado em minúsculo/misto saía errado no
            // boleto/Pix, mesmo aparecendo certo nas telas que forçam uppercase por CSS.
            const cliente = await asaas(apiKey, ambiente, 'POST', '/customers', {
                name: nomeUpper,
                cpfCnpj: cpfCnpjClean,
                ...(email ? { email } : {}),
            });
            customerId = cliente.id;
        }

        const totalParcelas = itensParcelas.length;
        for (let i = 0; i < totalParcelas; i++) {
            const p = itensParcelas[i];
            const descricao = totalParcelas > 1 ? `Cobrança — ${nome} (parcela ${i + 1}/${totalParcelas})` : `Cobrança — ${nome}`;
            const payment = await asaas(apiKey, ambiente, 'POST', '/payments', {
                customer: customerId,
                billingType: tipo,
                value: Number(p.valor),
                dueDate: p.vencimento,
                description: descricao,
                externalReference: String(leadId),
            });

            let pixPayload: string | null = null;
            let pixQrcode: string | null = null;
            if (tipo === 'PIX' && payment.id) {
                const pix = await asaas(apiKey, ambiente, 'GET', `/payments/${payment.id}/pixQrCode`);
                pixPayload = pix.payload || null;
                pixQrcode = pix.encodedImage || null;
            }

            resultados.push({
                paymentId: payment.id,
                parcela: totalParcelas > 1 ? `${i + 1}/${totalParcelas}` : null,
                tipo,
                valor: payment.value,
                vencimento: payment.dueDate,
                invoiceUrl: payment.invoiceUrl || null,
                bankSlipUrl: payment.bankSlipUrl || null,
                linhaDigitavel: payment.identificationField || null,
                pixPayload,
                pixQrcode,
            });
        }

        await persistirCobrancas(resultados);
        return NextResponse.json({ ok: true, parcelas: resultados });

    } catch (error: any) {
        console.error('[financeiro/cobranca]', error.message);
        await persistirCobrancas(resultados);
        const geradas = resultados.length;
        const msg = geradas > 0
            ? `${geradas} parcela(s) foram geradas antes do erro (salvas). Falhou em: ${error.message || 'erro desconhecido'}`
            : (error.message || 'Erro ao gerar cobrança.');
        return NextResponse.json({ erro: msg, parcelas: resultados }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!accessToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
    if (!user) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });

    const { data: perfil } = await supabaseAdmin.from('profiles').select('empresa_id').eq('id', user.id).single();
    if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });

    const { data: integracao } = await supabaseAdmin.from('financeiro_integracoes')
        .select('asaas_api_key, ambiente').eq('empresa_id', perfil.empresa_id).maybeSingle();
    if (!integracao?.asaas_api_key) {
        return NextResponse.json({ erro: 'Sua empresa ainda não conectou uma conta Asaas própria.' }, { status: 400 });
    }

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
    const { leadId, asaasPaymentId } = body;
    if (!leadId || !asaasPaymentId) {
        return NextResponse.json({ erro: 'Campo(s) obrigatório(s) faltando: leadId, asaasPaymentId.' }, { status: 422 });
    }

    try {
        // Só confirma dono da cobrança antes de mexer — o lead precisa ser da mesma empresa
        // do usuário logado (RLS não se aplica aqui porque é service role).
        const { data: lead } = await supabaseAdmin.from('leads').select('cobrancas_manuais, empresa_id').eq('id', leadId).single();
        if (!lead || lead.empresa_id !== perfil.empresa_id) {
            return NextResponse.json({ erro: 'Venda não encontrada.' }, { status: 404 });
        }

        try {
            await asaas(integracao.asaas_api_key, integracao.ambiente, 'DELETE', `/payments/${asaasPaymentId}`);
        } catch (erroDelete: any) {
            // A Asaas só deixa REMOVER (DELETE de verdade) cobrança PENDING/OVERDUE — pra
            // qualquer outro status ela recusa com uma mensagem genérica ("só é possível
            // remover pendentes ou vencidas") sem dizer qual é o status real. Busca o status
            // de verdade pra dar um erro que realmente ajuda a decidir o que fazer, em vez de
            // só repassar a mensagem genérica da Asaas.
            let statusReal = '';
            try {
                const pagamento = await asaas(integracao.asaas_api_key, integracao.ambiente, 'GET', `/payments/${asaasPaymentId}`);
                statusReal = STATUS_ASAAS_PT[pagamento.status] || pagamento.status;
            } catch { /* se nem o GET funcionar, segue só com a mensagem original */ }
            const msg = statusReal
                ? `Essa cobrança está com status "${statusReal}" na Asaas — só é possível remover cobranças pendentes ou vencidas. ${statusReal.toLowerCase().includes('receb') || statusReal.toLowerCase().includes('confirmad') ? 'Se foi paga por engano, cancelar aqui não desfaz o pagamento — isso precisa de estorno, que não é feito por essa tela.' : ''}`.trim()
                : erroDelete.message;
            throw new Error(msg);
        }

        const cobrancasAtuais = Array.isArray(lead.cobrancas_manuais) ? lead.cobrancas_manuais : [];
        const cobrancasAtualizadas = cobrancasAtuais.map((c: any) =>
            c.asaasPaymentId === asaasPaymentId ? { ...c, cancelada: true, canceladoEm: new Date().toISOString() } : c
        );
        await supabaseAdmin.from('leads').update({ cobrancas_manuais: cobrancasAtualizadas }).eq('id', leadId);

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[financeiro/cobranca DELETE]', error.message);
        return NextResponse.json({ erro: error.message || 'Erro ao cancelar cobrança.' }, { status: 500 });
    }
}
