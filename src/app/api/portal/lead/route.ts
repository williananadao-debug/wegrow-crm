import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ipRequests = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
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

async function enviarEmailConfirmacao(email: string, empresa: string, leadId: number) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
    const statusUrl = `${baseUrl}/solicitar/status?id=${leadId}`;

    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'Portal WeGrow <portal@wegrow.app.br>',
            to: [email],
            subject: `✅ Solicitação recebida — ${empresa}`,
            html: `
                <div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <h1 style="color:#22C55E;font-size:24px;margin-bottom:8px">Solicitação Recebida!</h1>
                    <p style="color:#94a3b8;margin-bottom:24px">Olá <strong style="color:#fff">${empresa}</strong>, recebemos seu pedido de orçamento e nossa equipe comercial entrará em contato em breve.</p>
                    <div style="background:#0F172A;border:1px solid #1e293b;border-radius:12px;padding:20px;margin-bottom:24px">
                        <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px">Número do Protocolo</p>
                        <p style="color:#fff;font-size:20px;font-weight:900;margin:0">#${String(leadId).padStart(6, '0')}</p>
                    </div>
                    <a href="${statusUrl}" style="display:inline-block;background:#22C55E;color:#0F172A;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;text-transform:uppercase;letter-spacing:0.05em">Acompanhar Status</a>
                    <p style="color:#475569;font-size:11px;margin-top:32px">WeGrow CRM · Portal do Anunciante</p>
                </div>
            `,
        }),
    }).catch(err => console.error('[portal/lead] Resend error:', err));
}

async function enviarAlertaTime(para: string, lead: any, leadId: number) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'Portal WeGrow <portal@wegrow.app.br>',
            to: [para],
            subject: `🔔 Novo lead pelo portal — ${lead.empresa}`,
            html: `
                <div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <h1 style="color:#f97316;font-size:22px;margin-bottom:4px">Novo Lead no Portal!</h1>
                    <p style="color:#94a3b8;margin-bottom:24px">Uma nova solicitação de orçamento foi recebida.</p>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
                        ${[['Empresa', lead.empresa], ['Telefone', lead.telefone], ['E-mail', lead.email || '—'], ['CNPJ', lead.cnpj || '—'], ['Cidade', lead.unidade || '—']].map(([k, v]) => `
                        <tr><td style="color:#64748b;font-size:11px;text-transform:uppercase;padding:8px 0 2px;border-bottom:1px solid #1e293b">${k}</td></tr>
                        <tr><td style="color:#fff;font-weight:700;padding:0 0 8px;border-bottom:1px solid #1e293b">${v}</td></tr>`).join('')}
                        ${lead.descricao ? `<tr><td style="color:#64748b;font-size:11px;text-transform:uppercase;padding:8px 0 2px">Mensagem</td></tr><tr><td style="color:#cbd5e1;font-size:13px;padding:0 0 8px">${lead.descricao}</td></tr>` : ''}
                    </table>
                    <a href="${baseUrl}/deals" style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:10px;font-weight:900;text-decoration:none;font-size:13px;text-transform:uppercase;letter-spacing:0.05em">Ver no CRM</a>
                    <p style="color:#475569;font-size:11px;margin-top:24px">Protocolo #${String(leadId).padStart(6, '0')} · WeGrow CRM</p>
                </div>
            `,
        }),
    }).catch(err => console.error('[portal/lead] alert email error:', err));
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

    const { empresa, telefone, email, cnpj, unidade, cidade, descricao } = body;

    if (!empresa || !telefone) {
        return NextResponse.json({ erro: 'Campos obrigatórios ausentes.' }, { status: 422 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data, error } = await supabaseAdmin.from('leads').insert([{
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
    }]).select('id').single();

    if (error) {
        console.error('[portal/lead] Supabase error:', error.code);
        return NextResponse.json({ erro: 'Não foi possível registrar sua solicitação.' }, { status: 500 });
    }

    const alertEmail = process.env.PORTAL_ALERT_EMAIL;
    const promises: Promise<any>[] = [];
    if (email && data?.id) promises.push(enviarEmailConfirmacao(email, empresa, data.id));
    if (alertEmail && data?.id) promises.push(enviarAlertaTime(alertEmail, { empresa, telefone, email, cnpj, unidade, descricao }, data.id));
    await Promise.all(promises);

    return NextResponse.json({ ok: true, id: data?.id }, { status: 201 });
}
