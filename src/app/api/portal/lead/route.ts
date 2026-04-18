import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const empresaId = process.env.PORTAL_EMPRESA_ID ?? '11111111-1111-1111-1111-111111111111';

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
