// Avisos para a CENTRAL do instalador (não para o cliente final): alarme crítico por e-mail
// e os alertas de segurança calculados no servidor (reboque, uso fora do horário).
import type { SupabaseClient } from '@supabase/supabase-js';

const urlApp = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br').replace(/\/$/, '');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** E-mail para a central (rastreio_cobranca_config.emp_email) — no máx. 1 por veículo a cada 15 min. */
export async function avisarCentral(db: SupabaseClient, p: { empresaId: string; veiculoId: string; titulo: string; mensagem: string; lat?: number | null; lng?: number | null }) {
  if (!process.env.RESEND_API_KEY) return false;
  const { data: cfg, error } = await db.from('rastreio_cobranca_config').select('emp_email, email_alarmes').eq('empresa_id', p.empresaId).maybeSingle();
  if (error || !cfg?.emp_email || cfg.email_alarmes === false) return false;
  const desde = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await db.from('rastreio_eventos').select('id', { count: 'exact', head: true })
    .eq('veiculo_id', p.veiculoId).eq('tipo', 'alarme').gte('ocorrido_em', desde);
  if ((count || 0) > 1) return false; // já avisou deste veículo agora há pouco (o atual conta 1)
  const mapa = p.lat != null && p.lng != null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : null;
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
    to: cfg.emp_email,
    subject: `🚨 ${p.titulo}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px">
      <p style="font-size:18px;font-weight:bold;color:#b91c1c">${esc(p.titulo)}</p>
      <p>${esc(p.mensagem)}</p>
      ${mapa ? `<p><a href="${mapa}">Ver no mapa</a></p>` : ''}
      <p><a href="${urlApp()}/rastreio/veiculos/${p.veiculoId}">Abrir o veículo no painel</a></p>
      <p style="color:#64748b;font-size:12px">Aviso automático do WeGrow Rastreio. Desligue em Financeiro do rastreio → Regras.</p></div>`,
  }).catch(() => null);
  return true;
}

type HorarioUso = { dias?: number[]; inicio?: string; fim?: string };
const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Dentro do horário permitido? (hora de Brasília; fim menor que início = atravessa a meia-noite) */
export function dentroDoHorario(h: HorarioUso, quando: string) {
  const br = new Date(Date.parse(quando) - 3 * 3600_000);
  const dia = br.getUTCDay();
  const min = br.getUTCHours() * 60 + br.getUTCMinutes();
  const hm = (s?: string) => { const [a, b] = String(s || '').split(':').map(Number); return (a || 0) * 60 + (b || 0); };
  const ini = hm(h.inicio || '00:00'), fim = hm(h.fim || '23:59');
  const dias = Array.isArray(h.dias) && h.dias.length ? h.dias : [0, 1, 2, 3, 4, 5, 6];
  if (ini <= fim) return dias.includes(dia) && min >= ini && min <= fim;
  // ex.: 22:00–06:00 — parte da noite pertence ao dia de início
  return (dias.includes(dia) && min >= ini) || (dias.includes((dia + 6) % 7) && min <= fim);
}
export function descreverHorario(h: HorarioUso) {
  const d = Array.isArray(h.dias) && h.dias.length ? [...h.dias].sort() : [0, 1, 2, 3, 4, 5, 6];
  const dias = d.join() === '1,2,3,4,5' ? 'seg a sex' : d.join() === '0,1,2,3,4,5,6' ? 'todos os dias' : d.map(x => NOMES_DIA[x]).join(', ');
  return `${dias}, ${h.inicio || '00:00'}–${h.fim || '23:59'}`;
}

/**
 * Alertas de segurança a cada posição em movimento/ligado:
 *  - reboque: anda com a ignição (real) desligada → alarme (1 a cada 30 min)
 *  - fora do horário: ligado/andando fora do horário permitido → aviso (1 a cada 6 h)
 * Lê as colunas novas numa consulta à parte: antes da migration, simplesmente não faz nada.
 */
export async function alertasSeguranca(
  db: SupabaseClient,
  v: { id: string; empresa_id: string; placa: string },
  p: { kmh: number; ignicao: boolean | null; virtual: boolean; quando: string; lat: number; lng: number },
  registrar: (ev: { empresa_id: string; veiculo_id: string; tipo: string; mensagem: string; lat?: number | null; lng?: number | null; ocorrido_em?: string }) => Promise<void>,
): Promise<string | null> {
  const { data: x, error } = await db.from('rastreio_veiculos').select('horario_uso, alerta_reboque_em, alerta_horario_em').eq('id', v.id).maybeSingle();
  if (error || !x) return null;
  const feito: string[] = [];
  const passou = (em: string | null, min: number) => !em || Date.parse(p.quando) - Date.parse(em) > min * 60_000;

  if (!p.virtual && p.ignicao === false && p.kmh >= 15 && passou(x.alerta_reboque_em, 30) && await reboqueConfirmado(db, v.id, p.quando)) {
    const msg = `${v.placa}: POSSÍVEL REBOQUE OU FURTO — em movimento a ${p.kmh} km/h com a ignição desligada`;
    await registrar({ empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'alarme', mensagem: msg, lat: p.lat, lng: p.lng, ocorrido_em: p.quando });
    await db.from('rastreio_veiculos').update({ alerta_reboque_em: p.quando }).eq('id', v.id);
    feito.push('alerta de reboque');
  }

  const h = x.horario_uso as HorarioUso | null;
  if (h && (p.ignicao === true || p.kmh >= 15) && !dentroDoHorario(h, p.quando) && passou(x.alerta_horario_em, 360)) {
    await registrar({
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'horario',
      mensagem: `${v.placa}: em uso fora do horário permitido (${descreverHorario(h)})`, lat: p.lat, lng: p.lng, ocorrido_em: p.quando,
    });
    await db.from('rastreio_veiculos').update({ alerta_horario_em: p.quando }).eq('id', v.id);
    feito.push('uso fora do horário');
  }
  return feito.length ? feito.join(', ') : null;
}

/**
 * O GT06 manda a ignição em pacote separado: na saída, o carro já anda alguns segundos antes do
 * "ignição ligada" chegar, e a última ignição conhecida ainda é "desligada". Para não alarmar
 * à toa, só confirma reboque se nos últimos 3 minutos: nenhuma posição veio com ignição ligada,
 * houve pelo menos 3 posições andando (≥ 10 km/h) e o veículo se deslocou ao menos 300 m.
 */
async function reboqueConfirmado(db: SupabaseClient, veiculoId: string, quando: string) {
  const desde = new Date(Date.parse(quando) - 3 * 60_000).toISOString();
  const { data } = await db.from('rastreio_posicoes').select('lat, lng, velocidade, ignicao, registrado_em')
    .eq('veiculo_id', veiculoId).gte('registrado_em', desde).lte('registrado_em', quando).order('registrado_em').limit(200);
  const pts = data || [];
  if (pts.some(q => q.ignicao === true)) return false;
  if (pts.filter(q => Number(q.velocidade) >= 10).length < 3) return false;
  const a = pts[0], b = pts[pts.length - 1];
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h)) >= 300;
}

/** Cron diário: rastreador sem comunicar há N dias (config do instalador). Avisa 1 vez por sumiço. */
export async function verificarSemComunicacao(db: SupabaseClient) {
  const { data: veics, error } = await db.from('rastreio_veiculos')
    .select('id, empresa_id, placa, ultima_comunicacao_em, alerta_sem_comunicacao_em').eq('status', 'ativo').not('ultima_comunicacao_em', 'is', null).limit(10000);
  if (error) return 0;
  const { data: cfgs } = await db.from('rastreio_cobranca_config').select('empresa_id, dias_sem_comunicacao');
  const diasPorEmpresa = new Map((cfgs || []).map(c => [c.empresa_id as string, Number(c.dias_sem_comunicacao) || 2]));
  let n = 0;
  for (const v of veics || []) {
    const dias = diasPorEmpresa.get(v.empresa_id) ?? 2;
    const sumiu = Date.now() - Date.parse(v.ultima_comunicacao_em) > dias * 86400_000;
    const jaAvisado = v.alerta_sem_comunicacao_em && Date.parse(v.alerta_sem_comunicacao_em) > Date.parse(v.ultima_comunicacao_em);
    if (!sumiu || jaAvisado) continue;
    const ha = Math.floor((Date.now() - Date.parse(v.ultima_comunicacao_em)) / 86400_000);
    // Só no painel da central (sem push ao cliente): é problema de chip/aparelho para o instalador resolver
    await db.from('rastreio_eventos').insert({
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'sem_comunicacao',
      mensagem: `${v.placa}: rastreador sem comunicar há ${ha} dia${ha === 1 ? '' : 's'} (verificar chip, energia ou aparelho)`,
    });
    await db.from('rastreio_veiculos').update({ alerta_sem_comunicacao_em: new Date().toISOString() }).eq('id', v.id);
    n++;
  }
  return n;
}
