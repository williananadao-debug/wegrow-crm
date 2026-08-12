import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarContratacoesPncp, filtrarPorPalavrasChave, formatarDataPncp } from '@/lib/pncp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // o PNCP é instável na prática (ver src/lib/pncp.ts) — retry + várias páginas pode passar do default

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarUsuario(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).single();
  if (!perfil?.empresa_id) return null;
  return { user, empresa_id: perfil.empresa_id, cargo: perfil.cargo };
}

// Busca interativa: usuário está esperando na tela, então prioriza responder
// rápido (poucas páginas, poucas tentativas por página) em vez de tentar ser
// exaustivo — se a 1ª leva não bastar, o usuário clica em buscar de novo.
// Confirmado na prática (2026-08-12) que mesmo com maxDuration=60 configurado
// a requisição ainda estourava algum limite antes disso, então o ajuste real
// é fazer menos trabalho por chamada, não pedir mais tempo.
const MAX_PAGINAS = 2;
const TENTATIVAS_POR_PAGINA = 2;

// Busca ao vivo no PNCP (só preview — não grava nada). O usuário escolhe quais
// resultados salvar como candidato via /api/argus/pncp/salvar.
export async function POST(request: Request) {
  const auth = await verificarUsuario(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { uf, modalidade, palavras_chave, dias } = body;
  if (!modalidade) return NextResponse.json({ erro: 'Modalidade é obrigatória (a API do PNCP exige esse filtro).' }, { status: 422 });

  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - Number(dias || 30));

  try {
    const paramsBase = {
      dataInicial: formatarDataPncp(inicio),
      dataFinal: formatarDataPncp(hoje),
      modalidade: Number(modalidade),
      uf: uf || null,
      tamanhoPagina: 50,
      tentativas: TENTATIVAS_POR_PAGINA,
    };

    // 1ª página primeiro (é a única forma de saber quantas páginas existem no
    // total) — o resto busca em paralelo em vez de sequencial, já que o PNCP
    // não expõe rate-limit e cada página já tem retry próprio (src/lib/pncp.ts).
    // Isso é o que evita a busca demorar 15-20s+ no pior caso.
    const primeira = await buscarContratacoesPncp({ ...paramsBase, pagina: 1 });
    const paginasParaBuscar = Math.min(primeira.paginasRestantes, MAX_PAGINAS - 1);

    const resto = await Promise.all(
      Array.from({ length: paginasParaBuscar }, (_, i) => buscarContratacoesPncp({ ...paramsBase, pagina: i + 2 }))
    );

    const encontrados = [primeira, ...resto].flatMap(r => r.data);
    const filtrados = filtrarPorPalavrasChave(encontrados, palavras_chave);
    return NextResponse.json({ resultados: filtrados, total_antes_do_filtro: encontrados.length, total_no_pncp: primeira.totalRegistros });
  } catch (err: any) {
    console.error('[Argus PNCP buscar] Erro:', err);
    return NextResponse.json({ erro: err.message || 'Erro ao consultar o PNCP.' }, { status: 502 });
  }
}
