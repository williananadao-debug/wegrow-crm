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

// Emissão manual de NFS-e via Asaas (Emissor Nacional). Precisa da empresa ter
// configurado código de serviço + alíquotas em Configurações antes — sem isso
// não tenta emitir (nota fiscal errada é pior que cobrança errada).
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

    if (!process.env.ASAAS_API_KEY) {
        return NextResponse.json({ erro: 'ASAAS_API_KEY não configurada no servidor.' }, { status: 500 });
    }

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { empresaId, nome, cpfCnpj, valor, dataEfetiva, descricaoServico, asaasPaymentId, leadId } = body;
    if (!empresaId || !nome || !cpfCnpj || !valor || !dataEfetiva) {
        return NextResponse.json({ erro: 'Campos obrigatórios: empresaId, nome, cpfCnpj, valor, dataEfetiva.' }, { status: 422 });
    }

    const { data: empresa, error: empErr } = await supabaseAdmin
        .from('empresas')
        .select('nfse_config')
        .eq('id', empresaId)
        .single();

    if (empErr) return NextResponse.json({ erro: 'Erro ao buscar empresa: ' + empErr.message }, { status: 500 });
    const cfg = empresa?.nfse_config;
    if (!cfg?.municipalServiceCode) {
        return NextResponse.json({ erro: 'Código de serviço municipal não configurado. Configure em Configurações → Emissão de Nota Fiscal antes de emitir.' }, { status: 422 });
    }

    try {
        const cpfCnpjClean = String(cpfCnpj).replace(/\D/g, '');

        const search = await asaas('GET', `/customers?cpfCnpj=${cpfCnpjClean}`);
        let customerId: string;
        if (search.data?.length > 0) customerId = search.data[0].id;
        else {
            const cliente = await asaas('POST', '/customers', { name: nome, cpfCnpj: cpfCnpjClean });
            customerId = cliente.id;
        }

        const invoice = await asaas('POST', '/invoices', {
            ...(asaasPaymentId ? { payment: asaasPaymentId } : { customer: customerId }),
            serviceDescription: descricaoServico || cfg.municipalServiceName || 'Serviço prestado',
            observations: '',
            value: Number(valor),
            deductions: 0,
            effectiveDate: dataEfetiva,
            municipalServiceCode: cfg.municipalServiceCode,
            municipalServiceName: cfg.municipalServiceName || undefined,
            taxes: {
                retainIss: Boolean(cfg.retainIss),
                iss: Number(cfg.iss) || 0,
                pis: Number(cfg.pis) || 0,
                cofins: Number(cfg.cofins) || 0,
                csll: Number(cfg.csll) || 0,
                inss: Number(cfg.inss) || 0,
                ir: Number(cfg.ir) || 0,
            },
        });

        if (leadId) {
            await supabaseAdmin.from('leads').update({
                nfse_invoice_id: invoice.id,
                nfse_pdf_url: invoice.pdfUrl || null,
                nfse_emitida_em: new Date().toISOString(),
            }).eq('id', leadId);
        }

        return NextResponse.json({
            ok: true,
            invoiceId: invoice.id,
            status: invoice.status,
            statusDescription: invoice.statusDescription,
            pdfUrl: invoice.pdfUrl || null,
        });
    } catch (error: any) {
        console.error('[financeiro/nfse]', error.message);
        return NextResponse.json({ erro: error.message || 'Erro ao emitir nota fiscal.' }, { status: 500 });
    }
}
