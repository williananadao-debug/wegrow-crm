import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ipRequests = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = ipRequests.get(ip);
    if (!entry || now > entry.resetAt) { ipRequests.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
    if (entry.count >= 10) return false;
    entry.count++;
    return true;
}

export async function GET(request: Request) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(ip)) return NextResponse.json({ erro: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 });

    const { searchParams } = new URL(request.url);
    const cnpj = searchParams.get('cnpj')?.replace(/\D/g, '');
    const id = searchParams.get('id');

    if (!cnpj || cnpj.length !== 14 || !id || isNaN(Number(id))) {
        return NextResponse.json({ erro: 'CNPJ e protocolo são obrigatórios.' }, { status: 400 });
    }

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data, error } = await db
        .from('leads')
        .select('id, empresa, tipo, contrato_inicio, contrato_fim, valor_total, cnpj, descricao, status, atividades')
        .eq('id', Number(id))
        .eq('status', 'ganho')
        .single();

    if (error || !data) {
        return NextResponse.json({ erro: 'Protocolo não encontrado ou associação inativa.' }, { status: 404 });
    }

    const cnpjCadastrado = (data.cnpj || '').replace(/\D/g, '');
    if (cnpjCadastrado !== cnpj) {
        return NextResponse.json({ erro: 'CNPJ não confere com o protocolo informado.' }, { status: 403 });
    }

    const segMatch = data.descricao?.match(/Segmento:\s*([^\n]+)/);
    const segmento = segMatch ? segMatch[1].trim() : null;

    const historicoPagamentos = (data.atividades || [])
        .filter((a: any) => a.tipo === 'pagamento')
        .map((a: any) => ({ data: a.created_at, descricao: a.descricao }));

    const hoje = new Date().toISOString().substring(0, 10);
    const ativa = !data.contrato_fim || data.contrato_fim >= hoje;

    return NextResponse.json({
        id: data.id,
        empresa: data.empresa,
        tipo: data.tipo || 'Associado',
        segmento,
        contrato_inicio: data.contrato_inicio,
        contrato_fim: data.contrato_fim,
        valor_total: data.valor_total || 0,
        ativa,
        historicoPagamentos,
    });
}
