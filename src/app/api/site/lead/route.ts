import { NextResponse } from 'next/server';

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
    if (entry.count >= 5) return false;
    entry.count++;
    return true;
}

async function enviarConfirmacao(email: string, nome: string) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'WeGrow CRM <contato@wegrow.app.br>',
            to: [email],
            subject: '✅ Recebemos seu contato',
            html: `
                <div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <h1 style="color:#22C55E;font-size:24px;margin-bottom:8px">Recebemos seu contato!</h1>
                    <p style="color:#94a3b8;margin-bottom:0">Olá <strong style="color:#fff">${nome}</strong>, obrigado pelo interesse no WeGrow CRM. Nosso time vai te chamar em breve pelo WhatsApp ou e-mail informado.</p>
                    <p style="color:#475569;font-size:11px;margin-top:32px">WeGrow CRM · wegrow.app.br</p>
                </div>
            `,
        }),
    }).catch(err => console.error('[site/lead] Resend confirmação error:', err));
}

async function enviarAlerta(para: string, lead: { nome: string; empresa: string; telefone: string; email?: string; mensagem?: string }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'WeGrow CRM <contato@wegrow.app.br>',
            to: [para],
            subject: `🔔 Novo lead pelo site — ${lead.empresa}`,
            html: `
                <div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <h1 style="color:#f97316;font-size:22px;margin-bottom:4px">Novo Lead no Site!</h1>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
                        ${[['Nome', lead.nome], ['Empresa', lead.empresa], ['WhatsApp', lead.telefone], ['E-mail', lead.email || '—']].map(([k, v]) => `
                        <tr><td style="color:#64748b;font-size:11px;text-transform:uppercase;padding:8px 0 2px;border-bottom:1px solid #1e293b">${k}</td></tr>
                        <tr><td style="color:#fff;font-weight:700;padding:0 0 8px;border-bottom:1px solid #1e293b">${v}</td></tr>`).join('')}
                        ${lead.mensagem ? `<tr><td style="color:#64748b;font-size:11px;text-transform:uppercase;padding:8px 0 2px">Mensagem</td></tr><tr><td style="color:#cbd5e1;font-size:13px;padding:0 0 8px">${lead.mensagem}</td></tr>` : ''}
                    </table>
                    <p style="color:#475569;font-size:11px;margin-top:16px">Origem: Landing page wegrow.app.br</p>
                </div>
            `,
        }),
    }).catch(err => console.error('[site/lead] Resend alerta error:', err));
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

    const { nome, empresa, telefone, email, mensagem } = body;

    if (!nome || !empresa || !telefone) {
        return NextResponse.json({ erro: 'Campos obrigatórios ausentes.' }, { status: 422 });
    }

    const alertEmail = process.env.PORTAL_ALERT_EMAIL;
    const promises: Promise<any>[] = [];
    if (email) promises.push(enviarConfirmacao(email, nome));
    if (alertEmail) promises.push(enviarAlerta(alertEmail, { nome, empresa, telefone, email, mensagem }));
    await Promise.all(promises);

    return NextResponse.json({ ok: true }, { status: 201 });
}
