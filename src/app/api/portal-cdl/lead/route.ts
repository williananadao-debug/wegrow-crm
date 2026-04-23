import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const CDL_EMPRESA_ID = '388620c8-4263-4d1a-bf96-ca69a12f621f';

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
    if (entry.count >= 5) return false;
    entry.count++;
    return true;
}

async function enviarEmailConfirmacao(email: string, empresa: string, leadId: number) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
    const statusUrl = `${baseUrl}/portal-cdl/status?id=${leadId}`;

    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'CDL de Taio <portal@wegrow.app.br>',
            to: [email],
            subject: `✅ Pré-cadastro recebido — ${empresa}`,
            html: `
                <div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
                        <div style="width:44px;height:44px;background:#22C55E;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#0B1120">CDL</div>
                        <div>
                            <div style="font-weight:900;font-size:18px;color:#fff">CDL de Taio</div>
                            <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.1em">Portal do Associado</div>
                        </div>
                    </div>
                    <h1 style="color:#22C55E;font-size:22px;margin-bottom:8px">Pré-cadastro Recebido!</h1>
                    <p style="color:#94a3b8;margin-bottom:24px">Olá <strong style="color:#fff">${empresa}</strong>, recebemos seu pré-cadastro de associação. Nossa equipe entrará em contato em breve para dar continuidade ao processo.</p>
                    <div style="background:#0F172A;border:1px solid #1e293b;border-radius:12px;padding:20px;margin-bottom:24px">
                        <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px">Número do Protocolo</p>
                        <p style="color:#22C55E;font-size:24px;font-weight:900;margin:0">#${String(leadId).padStart(6, '0')}</p>
                    </div>
                    <a href="${statusUrl}" style="display:inline-block;background:#22C55E;color:#0B1120;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;text-transform:uppercase;letter-spacing:0.05em">Acompanhar Status</a>
                    <p style="color:#475569;font-size:11px;margin-top:32px">CDL de Taio · Câmara de Dirigentes Lojistas</p>
                </div>
            `,
        }),
    }).catch(err => console.error('[portal-cdl/lead] Resend error:', err));
}

async function enviarAlertaTime(para: string, lead: any, leadId: number) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'CDL de Taio <portal@wegrow.app.br>',
            to: [para],
            subject: `🔔 Novo prospecto no portal CDL — ${lead.empresa}`,
            html: `
                <div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <h1 style="color:#22C55E;font-size:22px;margin-bottom:4px">Novo Prospecto CDL!</h1>
                    <p style="color:#94a3b8;margin-bottom:24px">Um novo pré-cadastro de associação foi recebido pelo portal.</p>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
                        ${[['Empresa', lead.empresa], ['Responsável', lead.responsavel || '—'], ['WhatsApp', lead.telefone], ['E-mail', lead.email || '—'], ['CNPJ', lead.cnpj || '—'], ['Segmento', lead.segmento || '—'], ['Tipo de Associação', lead.tipoAssociacao || '—']].map(([k, v]) => `
                        <tr><td style="color:#64748b;font-size:11px;text-transform:uppercase;padding:8px 0 2px;border-bottom:1px solid #1e293b">${k}</td></tr>
                        <tr><td style="color:#fff;font-weight:700;padding:0 0 8px;border-bottom:1px solid #1e293b">${v}</td></tr>`).join('')}
                        ${lead.descricao ? `<tr><td style="color:#64748b;font-size:11px;text-transform:uppercase;padding:8px 0 2px">Observação</td></tr><tr><td style="color:#cbd5e1;font-size:13px;padding:0 0 8px">${lead.descricao}</td></tr>` : ''}
                    </table>
                    <a href="${baseUrl}/deals" style="display:inline-block;background:#22C55E;color:#0B1120;padding:12px 24px;border-radius:10px;font-weight:900;text-decoration:none;font-size:13px;text-transform:uppercase;letter-spacing:0.05em">Ver no CRM</a>
                    <p style="color:#475569;font-size:11px;margin-top:24px">Protocolo #${String(leadId).padStart(6, '0')} · CDL de Taio</p>
                </div>
            `,
        }),
    }).catch(err => console.error('[portal-cdl/lead] alert email error:', err));
}

export async function POST(request: Request) {
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

    const { empresa, responsavel, telefone, email, cnpj, segmento, tipoAssociacao, descricao } = body;

    if (!empresa || !telefone) {
        return NextResponse.json({ erro: 'Campos obrigatórios ausentes.' }, { status: 422 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const descricaoFull = [
        responsavel ? `Responsável: ${responsavel}` : null,
        segmento ? `Segmento: ${segmento}` : null,
        tipoAssociacao ? `Tipo de Associação: ${tipoAssociacao}` : null,
        descricao ? `Observação: ${descricao}` : null,
    ].filter(Boolean).join('\n');

    const { data, error } = await supabaseAdmin.from('leads').insert([{
        empresa,
        telefone,
        cnpj: cnpj || null,
        descricao: descricaoFull || null,
        status: 'aberto',
        origem: 'Portal CDL',
        valor_total: 0,
        etapa: 0,
        empresa_id: CDL_EMPRESA_ID,
    }]).select('id').single();

    if (error) {
        console.error('[portal-cdl/lead] Supabase error:', error.code);
        return NextResponse.json({ erro: 'Não foi possível registrar seu cadastro.' }, { status: 500 });
    }

    const alertEmail = process.env.CDL_ALERT_EMAIL || process.env.PORTAL_ALERT_EMAIL;
    const promises: Promise<any>[] = [];
    if (email && data?.id) promises.push(enviarEmailConfirmacao(email, empresa, data.id));
    if (alertEmail && data?.id) promises.push(enviarAlertaTime(alertEmail, { empresa, responsavel, telefone, email, cnpj, segmento, tipoAssociacao, descricao }, data.id));
    await Promise.all(promises);

    return NextResponse.json({ ok: true, id: data?.id }, { status: 201 });
}
