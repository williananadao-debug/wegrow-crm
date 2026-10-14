import { NextResponse, after } from 'next/server';
import {
  atualizar, lerEstado, municipiosDaEleicao, eleicaoPresidente, INTERVALO_MS, type Modo,
} from '@/lib/eleicao/tse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// Roda em São Paulo: perto do TSE e com IP brasileiro.
export const preferredRegion = 'gru1';

// Painel público /eleicao. Três partes:
//   ?parte=resumo     — candidatos, totais, versão (pequeno; o painel consulta a cada ~4s)
//   ?parte=mapa&v=N   — votos por município (grande; só baixado quando a versão muda)
//   ?parte=municipios — nome/UF de cada município pelo código IBGE (fixo)
// O cache da CDN (s-maxage) faz o TSE/Supabase serem consultados uma vez por janela,
// não uma vez por ouvinte. É também cada ida à origem do ?parte=resumo que dispara a
// próxima atualização no TSE — não precisa de cron enquanto houver alguém olhando.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modo: Modo = url.searchParams.get('teste') === '1' ? 'teste' : 'real';
  const parte = url.searchParams.get('parte') || 'resumo';

  if (parte === 'municipios') {
    const mapa = await municipiosDaEleicao(eleicaoPresidente(modo)).catch(() => null);
    if (!mapa) return NextResponse.json({ erro: 'Lista de municípios indisponível no TSE.' }, { status: 502 });
    const porIbge: Record<string, [string, string]> = {};
    for (const m of Object.values(mapa)) porIbge[m.cdi] = [m.nome, m.uf];
    return NextResponse.json(porIbge, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' } });
  }

  let estado;
  try { estado = await lerEstado(modo); }
  catch (e: any) { return NextResponse.json({ erro: 'Erro ao ler cache: ' + e.message }, { status: 500 }); }
  if (!estado) {
    return NextResponse.json({ erro: 'Tabela eleicao_cache não encontrada — rode a migration 20261014120000_eleicao_cache.sql.' }, { status: 503 });
  }

  const { pub, atualizadoEm } = estado;

  if (parte === 'mapa') {
    return NextResponse.json({
      versao: pub.versao,
      presidente: { finalistas: pub.presidente.finalistas, mun: pub.presidente.mun },
      governadores: pub.governadores.map(g => ({ id: g.id, finalistas: g.finalistas, mun: g.mun })),
    }, {
      // A URL leva ?v=<versão>, então cada versão é uma chave de cache diferente.
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    });
  }

  if (Date.now() - atualizadoEm > INTERVALO_MS) {
    after(async () => {
      try { await atualizar(modo); } catch (e) { console.error('[eleicao] atualizar', e); }
    });
  }

  const semMapa = (d: typeof pub.presidente) => ({ ...d, mun: undefined });
  return NextResponse.json({
    modo: pub.modo, versao: pub.versao, atualizadoEm: pub.atualizadoEm, mapaPausadoAte: pub.mapaPausadoAte || null,
    presidente: semMapa(pub.presidente),
    governadores: pub.governadores.map(semMapa),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' },
  });
}
