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

type Veic = { id: string; empresa_id: string; placa: string; limite_velocidade: number | null; motorista_id?: string | null };

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
  let ligadoMs = 0, ociosoMs = 0, excessos = 0, freadas = 0, aceleracoes = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = new Date(pts[i].registrado_em!).getTime() - new Date(pts[i - 1].registrado_em!).getTime();
    if (pts[i - 1].ignicao && dt > 0 && dt <= LACUNA_MAX_MS) {
      ligadoMs += dt;
      // motor ligado e parado (marcha lenta)
      if (Number(pts[i - 1].velocidade || 0) < 3 && Number(pts[i].velocidade || 0) < 3) ociosoMs += dt;
    }
    const lim = Number(v.limite_velocidade || 0);
    if (lim && Number(pts[i].velocidade || 0) > lim && Number(pts[i - 1].velocidade || 0) <= lim) excessos++;
    // Freada/arrancada brusca: variação ≥ 12 km/h por segundo, só com pontos próximos (≤ 15 s)
    if (dt > 0 && dt <= 15_000) {
      const dv = (Number(pts[i].velocidade || 0) - Number(pts[i - 1].velocidade || 0)) / (dt / 1000);
      if (dv <= -12) freadas++;
      else if (dv >= 12) aceleracoes++;
    }
  }
  // Nota de condução 0–100: começa em 100 e perde por excesso, freada e arrancada (dia com ≥ 1 km)
  const nota = an.km >= 1 ? Math.max(0, Math.min(100, Math.round(100 - excessos * 5 - freadas * 3 - aceleracoes * 2
    - (Number(v.limite_velocidade || 0) && an.velMax > Number(v.limite_velocidade) + 20 ? 10 : 0)))) : null;
  const linha = {
    veiculo_id: v.id, dia, empresa_id: v.empresa_id,
    km: Math.round(an.km * 100) / 100, minutos_movimento: an.minutosMovimento, minutos_ligado: Math.round(ligadoMs / 60000),
    paradas: an.paradas.length, viagens: an.viagens.length, velocidade_max: Math.round(an.velMax), excessos,
    minutos_ocioso: Math.round(ociosoMs / 60000), freadas, aceleracoes, nota_conducao: nota, motorista_id: v.motorista_id ?? null,
    primeira_posicao: pts[0].registrado_em, ultima_posicao: pts[pts.length - 1].registrado_em, pontos: pts.length,
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await db.from('rastreio_resumo_diario').upsert(linha, { onConflict: 'veiculo_id,dia' });
  if (error) {
    // antes da migration (colunas novas): grava o resumo básico
    const { minutos_ocioso, freadas: f, aceleracoes: a, nota_conducao, motorista_id, ...basico } = linha;
    void minutos_ocioso; void f; void a; void nota_conducao; void motorista_id;
    await db.from('rastreio_resumo_diario').upsert(basico, { onConflict: 'veiculo_id,dia' });
  }
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
  const { data: veics } = await db.from('rastreio_veiculos').select('id, empresa_id, placa, limite_velocidade, motorista_id')
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
