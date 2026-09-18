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

    const { leadId, nome, cpfCnpj, email, valor, vencimento, tipo } = body;
    const faltando = [
        !leadId && 'leadId', !nome && 'nome', !cpfCnpj && 'cpfCnpj',
        !valor && 'valor', !vencimento && 'vencimento', !tipo && 'tipo',
    ].filter(Boolean);
    if (faltando.length > 0) {
        return NextResponse.json({ erro: `Campo(s) obrigatório(s) faltando: ${faltando.join(', ')}.` }, { status: 422 });
    }
    if (!['BOLETO', 'PIX'].includes(tipo)) {
        return NextResponse.json({ erro: 'tipo deve ser BOLETO ou PIX.' }, { status: 422 });
    }

    try {
        const cpfCnpjClean = String(cpfCnpj).replace(/\D/g, '');

        // Busca ou cria cliente no Asaas
        let customerId: string;
        const search = await asaas(apiKey, ambiente, 'GET', `/customers?cpfCnpj=${cpfCnpjClean}`);
        if (search.data?.length > 0) {
            customerId = search.data[0].id;
        } else {
            const cliente = await asaas(apiKey, ambiente, 'POST', '/customers', {
                name: nome,
                cpfCnpj: cpfCnpjClean,
                ...(email ? { email } : {}),
            });
            customerId = cliente.id;
        }

        // Cria cobrança
        const payment = await asaas(apiKey, ambiente, 'POST', '/payments', {
            customer: customerId,
            billingType: tipo,
            value: Number(valor),
            dueDate: vencimento,
            description: `Cobrança — ${nome}`,
            externalReference: String(leadId),
        });

        // Para PIX, busca QR Code
        let pixPayload: string | null = null;
        let pixQrcode: string | null = null;
        if (tipo === 'PIX' && payment.id) {
            const pix = await asaas(apiKey, ambiente, 'GET', `/payments/${payment.id}/pixQrCode`);
            pixPayload = pix.payload || null;
            pixQrcode = pix.encodedImage || null;
        }

        return NextResponse.json({
            ok: true,
            paymentId: payment.id,
            tipo,
            valor: payment.value,
            vencimento: payment.dueDate,
            invoiceUrl: payment.invoiceUrl || null,
            bankSlipUrl: payment.bankSlipUrl || null,
            linhaDigitavel: payment.identificationField || null,
            pixPayload,
            pixQrcode,
        });

    } catch (error: any) {
        console.error('[financeiro/cobranca]', error.message);
        return NextResponse.json({ erro: error.message || 'Erro ao gerar cobrança.' }, { status: 500 });
    }
}
