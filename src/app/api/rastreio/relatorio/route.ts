import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { analisarTrajeto } from '@/app/rastreio/analise';
import { calcularResumoDia, posicoesDoPeriodo, diaBR } from '@/lib/rastreioResumo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FUSO = '-03:00';
const valida = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

// Relatórios do painel que precisam das posições (calculados aqui, só o resultado vai ao navegador):
//  - viagens: viagens e paradas de um veículo, até 7 dias
//  - hoje: recalcula o resumo de hoje (a rotina noturna fecha o dia; isso deixa o relatório em dia)
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { acao, veiculoId, ini, fim } = await req.json().catch(() => ({}));

  if (acao === 'hoje') {
    const { data: veics } = await db.from('rastreio_veiculos').select('id, empresa_id, placa, limite_velocidade')
      .eq('empresa_id', u.empresaId).eq('status', 'ativo')
      .gte('ultima_posicao_em', `${diaBR()}T00:00:00${FUSO}`).limit(60);
    for (const v of veics || []) await calcularResumoDia(db, v, diaBR());
    return NextResponse.json({ ok: true, veiculos: (veics || []).length });
  }

  if (acao === 'viagens') {
    if (!valida(ini) || !valida(fim) || fim < ini) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
    if ((Date.parse(fim) - Date.parse(ini)) / 86400_000 > 6) return NextResponse.json({ error: 'Para viagens e paradas, escolha até 7 dias.' }, { status: 400 });
    const { data: v } = await db.from('rastreio_veiculos').select('id, placa').eq('id', veiculoId).eq('empresa_id', u.empresaId).maybeSingle();
    if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
    const pts = await posicoesDoPeriodo(db, v.id, `${ini}T00:00:00${FUSO}`, `${fim}T23:59:59.999${FUSO}`, 30000);
    const an = analisarTrajeto(pts);
    return NextResponse.json({
      placa: v.placa, km: an.km, minutosMovimento: an.minutosMovimento, velMax: an.velMax,
      viagens: an.viagens.map(x => ({ ini: x.ini, fim: x.fim, km: x.km, minutos: x.minutos, velMax: x.velMax, de: pts[x.iIni] && { lat: pts[x.iIni].lat, lng: pts[x.iIni].lng }, ate: pts[x.iFim] && { lat: pts[x.iFim].lat, lng: pts[x.iFim].lng } })),
      paradas: an.paradas,
      truncado: pts.length >= 30000,
    });
  }
  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
