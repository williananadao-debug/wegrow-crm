import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const busca = searchParams.get('busca')?.trim();

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: portal } = await db
        .from('empresa_portais')
        .select('empresa_id, nome_portal, etapas')
        .eq('slug', slug)
        .eq('ativo', true)
        .single();

    if (!portal) return NextResponse.json({ erro: 'Portal não encontrado.' }, { status: 404 });

    const etapas = (portal.etapas as string[]) ?? ['Recebido', 'Em análise', 'Proposta enviada', 'Em negociação', 'Concluído'];

    // Se o lead já virou processo de advocacia com andamentos sincronizados (DataJud),
    // manda os últimos junto — cliente acompanha a movimentação real do processo, não só
    // a etapa comercial genérica. Vem vazio pra qualquer lead que não seja de advocacia.
    const buscarAndamentos = async (leadId: number) => {
        const { data: processo } = await db.from('advocacia_processos').select('id, numero_processo').eq('lead_id', leadId).maybeSingle();
        if (!processo) return { numeroProcesso: null, andamentos: [] as { nome: string; dataHora: string }[] };
        const { data: itens } = await db.from('advocacia_andamentos').select('nome, data_hora')
            .eq('processo_id', processo.id).order('data_hora', { ascending: false }).limit(10);
        return { numeroProcesso: processo.numero_processo, andamentos: (itens || []).map(a => ({ nome: a.nome, dataHora: a.data_hora })) };
    };

    const fmt = async (d: any) => ({
        id: d.id, empresa: d.empresa, status: d.status, etapa: d.etapa,
        etapaDescricao: etapas[d.etapa] ?? 'Em andamento', criadoEm: d.created_at,
        ...(await buscarAndamentos(d.id)),
    });

    if (id) {
        if (isNaN(Number(id))) return NextResponse.json({ erro: 'ID inválido.' }, { status: 400 });
        const { data, error } = await db.from('leads')
            .select('id, empresa, status, etapa, created_at')
            .eq('id', Number(id)).eq('empresa_id', portal.empresa_id).single();
        if (error || !data) return NextResponse.json({ erro: 'Protocolo não encontrado.' }, { status: 404 });
        return NextResponse.json(await fmt(data));
    }

    if (busca) {
        const digits = busca.replace(/\D/g, '');
        const { data, error } = await db.from('leads')
            .select('id, empresa, status, etapa, created_at')
            .eq('empresa_id', portal.empresa_id)
            .or(`cnpj.ilike.%${digits}%,telefone.ilike.%${busca}%`)
            .order('created_at', { ascending: false }).limit(5);
        if (error || !data?.length) return NextResponse.json({ erro: 'Nenhum cadastro encontrado.' }, { status: 404 });
        return NextResponse.json(await Promise.all(data.map(fmt)));
    }

    return NextResponse.json({ erro: 'Informe id ou busca.' }, { status: 400 });
}
