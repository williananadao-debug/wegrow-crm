import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ASAAS_BASE = 'https://api.asaas.com/v3';

async function asaas(method: string, path: string, body?: any) {
    const res = await fetch(`${ASAAS_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'access_token': process.env.ASAAS_API_KEY!,
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

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { leadId, nome, cpfCnpj, email, valor, vencimento, tipo } = body;
    if (!leadId || !nome || !cpfCnpj || !valor || !vencimento || !tipo) {
        return NextResponse.json({ erro: 'Campos obrigatórios: leadId, nome, cpfCnpj, valor, vencimento, tipo.' }, { status: 422 });
    }
    if (!['BOLETO', 'PIX'].includes(tipo)) {
        return NextResponse.json({ erro: 'tipo deve ser BOLETO ou PIX.' }, { status: 422 });
    }

    try {
        const cpfCnpjClean = String(cpfCnpj).replace(/\D/g, '');

        // Busca ou cria cliente no Asaas
        let customerId: string;
        const search = await asaas('GET', `/customers?cpfCnpj=${cpfCnpjClean}`);
        if (search.data?.length > 0) {
            customerId = search.data[0].id;
        } else {
            const cliente = await asaas('POST', '/customers', {
                name: nome,
                cpfCnpj: cpfCnpjClean,
                ...(email ? { email } : {}),
            });
            customerId = cliente.id;
        }

        // Cria cobrança
        const payment = await asaas('POST', '/payments', {
            customer: customerId,
            billingType: tipo,
            value: Number(valor),
            dueDate: vencimento,
            description: `Cobrança WeGrow — ${nome}`,
            externalReference: String(leadId),
        });

        // Para PIX, busca QR Code
        let pixPayload: string | null = null;
        let pixQrcode: string | null = null;
        if (tipo === 'PIX' && payment.id) {
            const pix = await asaas('GET', `/payments/${payment.id}/pixQrCode`);
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
