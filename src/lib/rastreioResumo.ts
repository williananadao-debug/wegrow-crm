// Resumo diário por veículo (km, tempo em movimento/ligado, paradas, viagens, velocidade máxima
// e excessos), hodômetro e aviso de manutenção. Roda no cron diário; o relatório de 31 dias lê
// essa tabela pequena em vez de baixar dezenas de milhares de posições.
import type { SupabaseClient } from '@supabase/supabase-js';
import { analisarTrajeto, type Ponto } from '@/app/rastreio/analise';
import { registrarEvento } from '@/lib/rastreio';

const FUSO = '-03:00';
const LACUNA_MAX_MS = 10 * 60_000; // buraco maior que isso não conta como "ligado"

export function diaBR(offsetDias = 0) {
  return new Date(Date.now() - 3 * 3600_000 + offsetDias * 86400_000).toISOString().slice(0, 10);
}

type Veic = { id: string; empresa_id: string; placa: string; limite_velocidade: number | null };

export async function posicoesDoPeriodo(db: SupabaseClient, veiculoId: string, ini: string, fim: string, limite = 20000) {
  const { data } = await db.from('rastreio_posicoes').select('lat, lng, velocidade, ignicao, registrado_em')
    .eq('veiculo_id', veiculoId).gte('registrado_em', ini).lte('registrado_em', fim)
    .order('registrado_em').limit(limite);
  return (data || []) as (Ponto & { ignicao: boolean | null })[];
}

export async function calcularResumoDia(db: SupabaseClient, v: Veic, dia: string) {
  const pts = await posicoesDoPeriodo(db, v.id, `${dia}T00:00:00${FUSO}`, `${dia}T23:59:59.999${FUSO}`);
  if (!pts.length) {
    await db.from('rastreio_resumo_diario').delete().eq('veiculo_id', v.id).eq('dia', dia);
    return null;
  }
  const an = analisarTrajeto(pts);
  let ligadoMs = 0, excessos = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = new Date(pts[i].registrado_em!).getTime() - new Date(pts[i - 1].registrado_em!).getTime();
    if (pts[i - 1].ignicao && dt > 0 && dt <= LACUNA_MAX_MS) ligadoMs += dt;
    const lim = Number(v.limite_velocidade || 0);
    if (lim && Number(pts[i].velocidade || 0) > lim && Number(pts[i - 1].velocidade || 0) <= lim) excessos++;
  }
  const linha = {
    veiculo_id: v.id, dia, empresa_id: v.empresa_id,
    km: Math.round(an.km * 100) / 100, minutos_movimento: an.minutosMovimento, minutos_ligado: Math.round(ligadoMs / 60000),
    paradas: an.paradas.length, viagens: an.viagens.length, velocidade_max: Math.round(an.velMax), excessos,
    primeira_posicao: pts[0].registrado_em, ultima_posicao: pts[pts.length - 1].registrado_em, pontos: pts.length,
    atualizado_em: new Date().toISOString(),
  };
  await db.from('rastreio_resumo_diario').upsert(linha, { onConflict: 'veiculo_id,dia' });
  return linha;
}

/** Hodômetro = valor informado na instalação + km somados pelo rastreador desde então. */
export async function atualizarOdometro(db: SupabaseClient, veiculoId: string) {
  const { data: v } = await db.from('rastreio_veiculos').select('odometro_base_km, odometro_base_em, instalado_em').eq('id', veiculoId).maybeSingle();
  if (!v) return null;
  const desde = v.odometro_base_em || v.instalado_em || '2000-01-01';
  const { data: dias } = await db.from('rastreio_resumo_diario').select('km').eq('veiculo_id', veiculoId).gte('dia', desde).limit(5000);
  const km = Number(v.odometro_base_km || 0) + (dias || []).reduce((s, d) => s + Number(d.km || 0), 0);
  const arred = Math.round(km * 10) / 10;
  await db.from('rastreio_veiculos').update({ odometro_km: arred }).eq('id', veiculoId);
  return arred;
}

/** Avisa (uma vez a cada 7 dias) a manutenção que venceu por km ou por data. */
export async function verificarManutencoes(db: SupabaseClient, v: Veic, odometro: number) {
  const { data: itens } = await db.from('rastreio_manutencoes').select('*').eq('veiculo_id', v.id).eq('ativo', true);
  const hoje = diaBR();
  for (const m of itens || []) {
    const kmRodado = m.ultima_km != null ? odometro - Number(m.ultima_km) : null;
    const dias = m.ultima_em ? Math.floor((Date.parse(hoje) - Date.parse(m.ultima_em)) / 86400_000) : null;
    const porKm = m.intervalo_km && kmRodado != null && kmRodado >= m.intervalo_km;
    const porData = m.intervalo_dias && dias != null && dias >= m.intervalo_dias;
    if (!porKm && !porData) continue;
    if (m.avisado_em && Date.now() - new Date(m.avisado_em).getTime() < 7 * 86400_000) continue;
    await registrarEvento(db, {
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'manutencao',
      mensagem: `${v.placa}: ${m.nome} vencida (${porKm ? `${Math.round(kmRodado!)} km desde a última` : `${dias} dias desde a última`})`,
    });
    await db.from('rastreio_manutencoes').update({ avisado_em: new Date().toISOString() }).eq('id', m.id);
  }
}

/** Rotina diária: ontem e hoje de cada veículo que comunicou nos últimos 2 dias. */
export async function rodarResumoDiario(db: SupabaseClient) {
  const desde = new Date(Date.now() - 2 * 86400_000).toISOString();
  const { data: veics } = await db.from('rastreio_veiculos').select('id, empresa_id, placa, limite_velocidade')
    .eq('status', 'ativo').gte('ultima_posicao_em', desde).limit(5000);
  let n = 0;
  for (const v of (veics || []) as Veic[]) {
    await calcularResumoDia(db, v, diaBR(-1));
    await calcularResumoDia(db, v, diaBR(0));
    const odo = await atualizarOdometro(db, v.id);
    if (odo != null) await verificarManutencoes(db, v, odo);
    n++;
  }
  // Manutenção por data também vence em veículo parado/sem sinal.
  const { data: porData } = await db.from('rastreio_manutencoes').select('veiculo_id').eq('ativo', true).not('intervalo_dias', 'is', null).limit(5000);
  const jaFeitos = new Set((veics || []).map(v => v.id));
  for (const id of [...new Set((porData || []).map(m => m.veiculo_id as string))].filter(id => !jaFeitos.has(id))) {
    const { data: v } = await db.from('rastreio_veiculos').select('id, empresa_id, placa, limite_velocidade, odometro_km').eq('id', id).eq('status', 'ativo').maybeSingle();
    if (v) await verificarManutencoes(db, v as Veic, Number(v.odometro_km || 0));
  }
  return { veiculos: n };
}
