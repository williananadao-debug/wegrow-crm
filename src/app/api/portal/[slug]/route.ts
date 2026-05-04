import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ipReqs = new Map<string, { count: number; resetAt: number }>();
function checkRate(ip: string): boolean {
    const now = Date.now();
    if (ipReqs.size > 500) for (const [k, v] of ipReqs.entries()) { if (now > v.resetAt) ipReqs.delete(k); }
    const e = ipReqs.get(ip);
    if (!e || now > e.resetAt) { ipReqs.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
    if (e.count >= 5) return false;
    e.count++; return true;
}

function db() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function getPortal(slug: string) {
    const { data } = await db().from('empresa_portais').select('*').eq('slug', slug).eq('ativo', true).single();
    return data;
}

// GET — config pública do portal
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
    const portal = await getPortal(params.slug);
    if (!portal) return NextResponse.json({ erro: 'Portal não encontrado.' }, { status: 404 });
    const { empresa_id, alert_email, ...pub } = portal;
    return NextResponse.json(pub);
}

// POST — criar lead
export async function POST(req: Request, { params }: { params: { slug: string } }) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRate(ip)) return NextResponse.json({ erro: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });

    const portal = await getPortal(params.slug);
    if (!portal) return NextResponse.json({ erro: 'Portal não encontrado.' }, { status: 404 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { empresa, responsavel, telefone, email, cnpj, segmento, tipoCadastro, observacao } = body;
    if (!empresa || !telefone) return NextResponse.json({ erro: 'Campos obrigatórios ausentes.' }, { status: 422 });

    const tipos = (portal.tipos_cadastro as any[]) ?? [];
    const tipoMatch = tipos.find((t: any) => t.nome === tipoCadastro);
    const valor = tipoMatch?.valor ?? 0;

    const descricaoFull = [
        responsavel ? `Responsável: ${responsavel}` : null,
        email ? `E-mail: ${email}` : null,
        segmento ? `Segmento: ${segmento}` : null,
        tipoCadastro ? `Tipo: ${tipoCadastro}` : null,
        observacao ? `Observação: ${observacao}` : null,
    ].filter(Boolean).join('\n');

    const { data, error } = await db().from('leads').insert([{
        empresa, telefone,
        cnpj: cnpj || null,
        descricao: descricaoFull || null,
        status: 'aberto',
        origem: `Portal: ${portal.slug}`,
        valor_total: valor,
        etapa: 0,
        empresa_id: portal.empresa_id,
    }]).select('id').single();

    if (error) {
        console.error('[portal/lead]', error.message);
        return NextResponse.json({ erro: 'Não foi possível registrar seu cadastro.' }, { status: 500 });
    }

    const leadId = data?.id;
    const apiKey = process.env.RESEND_API_KEY;
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br';
    const cor = portal.cor_primaria || '#22C55E';
    const logo = portal.logo_texto || 'W';

    if (apiKey && leadId) {
        const mails: Promise<any>[] = [];
        const statusUrl = `${base}/p/${params.slug}/status?id=${leadId}`;

        if (email) mails.push(fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: `${portal.nome_portal} <portal@wegrow.app.br>`,
                to: [email],
                subject: `✅ Cadastro recebido — ${empresa}`,
                html: `<div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <div style="width:44px;height:44px;background:${cor};border-radius:10px;font-weight:900;font-size:16px;color:#0B1120;display:flex;align-items:center;justify-content:center;margin-bottom:16px">${logo}</div>
                    <h1 style="color:${cor};font-size:22px;margin-bottom:8px">Cadastro Recebido!</h1>
                    <p style="color:#94a3b8;margin-bottom:24px">Olá <strong style="color:#fff">${empresa}</strong>, recebemos seu cadastro. Nossa equipe entrará em contato em breve.</p>
                    <div style="background:#0F172A;border:1px solid #1e293b;border-radius:12px;padding:20px;margin-bottom:24px">
                        <p style="color:#64748b;font-size:12px;text-transform:uppercase;margin:0 0 4px">Protocolo</p>
                        <p style="color:${cor};font-size:24px;font-weight:900;margin:0">#${String(leadId).padStart(6, '0')}</p>
                    </div>
                    <a href="${statusUrl}" style="display:inline-block;background:${cor};color:#0B1120;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;text-transform:uppercase">Acompanhar Status</a>
                </div>`,
            }),
        }).catch(() => {}));

        if (portal.alert_email) mails.push(fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: `${portal.nome_portal} <portal@wegrow.app.br>`,
                to: [portal.alert_email],
                subject: `🔔 Novo cadastro no portal — ${empresa}`,
                html: `<div style="font-family:sans-serif;background:#0B1120;color:#fff;padding:40px;border-radius:16px;max-width:500px;margin:0 auto">
                    <h1 style="color:${cor};font-size:22px;margin-bottom:8px">Novo Cadastro!</h1>
                    <p style="color:#94a3b8;margin-bottom:24px">Novo cadastro recebido pelo ${portal.nome_portal}.</p>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">${[
                        ['Empresa', empresa], ['Responsável', responsavel || '—'], ['WhatsApp', telefone],
                        ['E-mail', email || '—'], ['CNPJ', cnpj || '—'], ['Segmento', segmento || '—'], ['Tipo', tipoCadastro || '—'],
                    ].map(([k, v]) => `<tr><td style="color:#64748b;font-size:11px;text-transform:uppercase;padding:6px 0 2px">${k}</td></tr><tr><td style="color:#fff;font-weight:700;padding:0 0 6px;border-bottom:1px solid #1e293b">${v}</td></tr>`).join('')}</table>
                    <a href="${base}/deals" style="display:inline-block;background:${cor};color:#0B1120;padding:12px 24px;border-radius:10px;font-weight:900;text-decoration:none;font-size:13px;text-transform:uppercase">Ver no CRM</a>
                    <p style="color:#475569;font-size:11px;margin-top:24px">Protocolo #${String(leadId).padStart(6, '0')}</p>
                </div>`,
            }),
        }).catch(() => {}));

        await Promise.all(mails);
    }

    return NextResponse.json({ ok: true, id: leadId }, { status: 201 });
}
