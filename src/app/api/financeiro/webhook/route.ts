import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

    const { event, payment } = body;

    if (!['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event)) {
        return NextResponse.json({ ok: true, skipped: true });
    }

    const leadId = payment?.externalReference;
    if (!leadId) return NextResponse.json({ ok: true, skipped: true });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const hoje = new Date().toISOString().substring(0, 10);
    const { error } = await supabaseAdmin
        .from('leads')
        .update({ data_pagamento: hoje })
        .eq('id', leadId);

    if (error) {
        console.error('[financeiro/webhook] Erro ao atualizar lead:', error.message);
        return NextResponse.json({ ok: false }, { status: 500 });
    }

    console.log(`[financeiro/webhook] Lead ${leadId} marcado como pago via Asaas (${event})`);
    return NextResponse.json({ ok: true });
}
