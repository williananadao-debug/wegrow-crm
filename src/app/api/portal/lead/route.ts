import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Rate limit: 10 submissões por IP por janela de 60s
const ipRequests = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
    const now = Date.now();

    // Limpeza lazy: evita crescimento ilimitado do Map em instâncias de longa duração
    if (ipRequests.size > 500) {
        for (const [k, v] of ipRequests.entries()) {
            if (now > v.resetAt) ipRequests.delete(k);
        }
    }

    const entry = ipRequests.get(ip);
    if (!entry || now > entry.resetAt) {
        ipRequests.set(ip, { count: 1, resetAt: now + 60_000 });
        return true;
    }
    if (entry.count >= 10) return false;
    entry.count++;
    return true;
}

export async function POST(request: Request) {
    const empresaId = process.env.PORTAL_EMPRESA_ID;
    if (!empresaId) {
        console.error('[portal/lead] PORTAL_EMPRESA_ID não configurado');
        return NextResponse.json({ erro: 'Serviço indisponível.' }, { status: 503 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
        return NextResponse.json({ erro: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ erro: 'Corpo da requisição inválido.' }, { status: 400 });
    }

    const { empresa, telefone, cnpj, unidade, cidade, descricao } = body;

    if (!empresa || !telefone) {
        return NextResponse.json({ erro: 'Campos obrigatórios ausentes.' }, { status: 422 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { error } = await supabaseAdmin.from('leads').insert([{
        empresa,
        telefone,
        cnpj: cnpj || null,
        unidade: unidade || null,
        cidade: cidade || null,
        descricao: descricao || null,
        status: 'aberto',
        origem: 'Portal Web',
        valor_total: 0,
        etapa: 0,
        empresa_id: empresaId,
    }]);

    if (error) {
        console.error('[portal/lead] Supabase error:', error.code);
        return NextResponse.json({ erro: 'Não foi possível registrar sua solicitação.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
}
