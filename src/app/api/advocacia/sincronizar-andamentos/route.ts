import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// API Pública do DataJud (CNJ) — gratuita, cobre todos os tribunais do Brasil, sem
// conta/token próprio da empresa. A chave abaixo é PÚBLICA e compartilhada por todo
// mundo que usa essa API (o próprio CNJ publica ela na wiki oficial); pode ser trocada
// via env var DATAJUD_API_KEY se o CNJ rotacionar a chave publicada.
// Ver: datajud-wiki.cnj.jus.br/api-publica/acesso
const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br';

export async function POST(req: Request) {
  try {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { empresa_id, processo_id } = body;
    if (!empresa_id || !processo_id) return NextResponse.json({ erro: 'Campos obrigatórios: empresa_id, processo_id.' }, { status: 422 });

    const supabase = db();
    const { data: processo, error: procErr } = await supabase.from('advocacia_processos')
      .select('id, numero_processo, tribunal').eq('id', processo_id).eq('empresa_id', empresa_id).single();
    if (procErr || !processo) return NextResponse.json({ erro: 'Processo não encontrado.' }, { status: 404 });
    if (!processo.numero_processo || !processo.tribunal) {
      return NextResponse.json({ erro: 'Preencha o número do processo (CNJ) e o tribunal antes de sincronizar.' }, { status: 422 });
    }

    const numeroLimpo = processo.numero_processo.replace(/\D/g, '');
    const datajudRes = await fetch(`${DATAJUD_BASE}/api_publica_${processo.tribunal}/_search`, {
      method: 'POST',
      headers: { 'Authorization': `APIKey ${DATAJUD_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match: { numeroProcesso: numeroLimpo } } }),
    });

    if (!datajudRes.ok) {
      const txt = await datajudRes.text();
      console.error('[sincronizar-andamentos/datajud]', datajudRes.status, txt.slice(0, 300));
      return NextResponse.json({ erro: 'DataJud retornou erro: ' + txt.slice(0, 200) }, { status: 502 });
    }

    const resultado = await datajudRes.json();
    const hit = resultado?.hits?.hits?.[0]?._source;
    if (!hit) {
      return NextResponse.json({ erro: 'Processo não encontrado no DataJud — confira o número e o tribunal selecionado.' }, { status: 404 });
    }

    const movimentos: { codigo?: number; nome: string; dataHora: string }[] = hit.movimentos || [];
    const novos = movimentos
      .filter((m) => m?.nome && m?.dataHora)
      .map((m) => ({ empresa_id, processo_id, codigo: m.codigo ?? null, nome: m.nome, data_hora: m.dataHora }));

    let inseridos = 0;
    if (novos.length > 0) {
      const { data: inseridosData } = await supabase.from('advocacia_andamentos')
        .upsert(novos, { onConflict: 'processo_id,codigo,data_hora', ignoreDuplicates: true })
        .select('id');
      inseridos = inseridosData?.length || 0;
    }

    await supabase.from('advocacia_processos').update({ ultima_sincronizacao: new Date().toISOString() }).eq('id', processo_id);

    return NextResponse.json({
      ok: true,
      total_andamentos: movimentos.length,
      novos: inseridos,
      classe: hit.classe?.nome || null,
      orgao_julgador: hit.orgaoJulgador?.nome || null,
    });
  } catch (err: any) {
    console.error('[sincronizar-andamentos/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
