// Módulo Rastreio — lado servidor. Os rastreadores falam com o Traccar (VPS, TCP); o Traccar
// repassa posições e eventos para /api/rastreio/traccar e recebe os comandos de bloqueio pela
// API REST dele. Variáveis (Vercel):
//   TRACCAR_URL            ex.: https://rastreio.wegrow.app.br  (sem barra no fim)
//   TRACCAR_USER / TRACCAR_PASSWORD   usuário admin do Traccar
//   TRACCAR_WEBHOOK_TOKEN  segredo que vai na URL do forward (?token=...)
import type { SupabaseClient } from '@supabase/supabase-js';

// Bloqueio só com o veículo parado ou quase: cortar combustível em movimento causa acidente.
export const VELOCIDADE_MAX_BLOQUEIO = 20; // km/h
// Posição mais velha que isso não serve para garantir que o veículo está devagar.
export const POSICAO_RECENTE_MIN = 10;

const NOS_PARA_KMH = 1.852; // o Traccar manda velocidade em nós

export function traccarConfigurado() {
  return Boolean(process.env.TRACCAR_URL && process.env.TRACCAR_USER && process.env.TRACCAR_PASSWORD);
}

async function traccar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown) {
  const base = String(process.env.TRACCAR_URL || '').replace(/\/$/, '');
  const auth = Buffer.from(`${process.env.TRACCAR_USER}:${process.env.TRACCAR_PASSWORD}`).toString('base64');
  const r = await fetch(`${base}/api${caminho}`, {
    method: metodo,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Traccar ${r.status}: ${texto.slice(0, 200) || r.statusText}`);
  return { status: r.status, dados: texto ? JSON.parse(texto) : null };
}

/** Garante o aparelho cadastrado no Traccar e devolve o id dele lá. */
export async function garantirDispositivoTraccar(imei: string, nome: string): Promise<number> {
  const busca = await traccar('GET', `/devices?uniqueId=${encodeURIComponent(imei)}`);
  const existente = Array.isArray(busca.dados) ? busca.dados[0] : null;
  if (existente?.id) return existente.id;
  const criado = await traccar('POST', '/devices', { name: nome, uniqueId: imei });
  return criado.dados.id;
}

/** engineStop / engineResume. 200 = entregue; 202 = aparelho offline, fica na fila do Traccar. */
export async function enviarComandoTraccar(deviceId: number, tipo: 'bloquear' | 'desbloquear') {
  const r = await traccar('POST', '/commands/send', { deviceId, type: tipo === 'bloquear' ? 'engineStop' : 'engineResume' });
  return { naFila: r.status === 202 };
}

// ── Recebimento (webhook do Traccar) ──────────────────────────────────────────────────────

type PosicaoTraccar = {
  latitude: number; longitude: number; speed?: number; course?: number;
  fixTime?: string; deviceTime?: string; serverTime?: string; valid?: boolean;
  attributes?: Record<string, unknown>;
};

const TEXTO_EVENTO: Record<string, (placa: string, attrs: Record<string, unknown>) => [string, string] | null> = {
  ignitionOn: placa => ['ignicao_ligada', `${placa}: ignição ligada`],
  ignitionOff: placa => ['ignicao_desligada', `${placa}: ignição desligada`],
  deviceOffline: placa => ['offline', `${placa}: rastreador sem comunicação`],
  deviceOnline: placa => ['online', `${placa}: rastreador voltou a comunicar`],
  geofenceEnter: placa => ['cerca', `${placa}: entrou na área cadastrada`],
  geofenceExit: placa => ['cerca', `${placa}: saiu da área cadastrada`],
  commandResult: (placa, a) => ['comando', `${placa}: aparelho respondeu ao comando${a.result ? ` (${String(a.result).slice(0, 80)})` : ''}`],
  alarm: (placa, a) => {
    const tipo = String(a.alarm || '');
    const nomes: Record<string, string> = {
      powerCut: 'bateria do veículo cortada', powerOff: 'rastreador desligado', tampering: 'violação do rastreador',
      sos: 'botão de pânico', vibration: 'vibração com o veículo desligado', movement: 'veículo movimentado',
      lowBattery: 'bateria interna fraca', overspeed: 'excesso de velocidade', accident: 'possível acidente',
    };
    return ['alarme', `${placa}: ALERTA — ${nomes[tipo] || tipo || 'alarme do aparelho'}`];
  },
};

/** Processa um POST do forward do Traccar (posição ou evento). Retorna o que fez, pra log. */
type CorpoWebhook = {
  device?: { id?: number; uniqueId?: string };
  position?: PosicaoTraccar;
  event?: { type?: string; eventTime?: string; attributes?: Record<string, unknown> };
};

export async function processarWebhookTraccar(db: SupabaseClient, corpoBruto: unknown): Promise<string> {
  const corpo = (corpoBruto || {}) as CorpoWebhook;
  const imei = String(corpo?.device?.uniqueId || '').trim();
  if (!imei) return 'sem device.uniqueId';

  const { data: v } = await db.from('rastreio_veiculos')
    .select('id, empresa_id, placa, limite_velocidade, ultima_velocidade, ultima_posicao_em, traccar_device_id')
    .eq('imei', imei).eq('status', 'ativo').maybeSingle();
  if (!v) return `imei ${imei} não cadastrado`;

  const agora = new Date().toISOString();
  const pos: PosicaoTraccar | undefined = corpo.position;
  const feito: string[] = [];

  if (pos && typeof pos.latitude === 'number' && typeof pos.longitude === 'number' && pos.valid !== false) {
    const attrs = pos.attributes || {};
    const kmh = Math.round((Number(pos.speed) || 0) * NOS_PARA_KMH);
    const quando = pos.fixTime || pos.deviceTime || pos.serverTime || agora;
    const ignicao = typeof attrs.ignition === 'boolean' ? attrs.ignition : null;

    // O forward de evento repete a posição que o gerou — só grava quando é forward de posição.
    if (!corpo.event) {
      await db.from('rastreio_posicoes').insert({
        empresa_id: v.empresa_id, veiculo_id: v.id, lat: pos.latitude, lng: pos.longitude,
        velocidade: kmh, curso: pos.course ?? null, ignicao, atributos: attrs, registrado_em: quando,
      });
      feito.push('posição');

      // Alerta de velocidade só na subida (não repete a cada posição acima do limite).
      if (v.limite_velocidade && kmh > v.limite_velocidade && Number(v.ultima_velocidade || 0) <= v.limite_velocidade) {
        await db.from('rastreio_eventos').insert({
          empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'velocidade',
          mensagem: `${v.placa}: ${kmh} km/h (limite ${v.limite_velocidade})`, lat: pos.latitude, lng: pos.longitude, ocorrido_em: quando,
        });
        feito.push('alerta de velocidade');
      }
    }

    // Só avança o "estado atual" se a posição for mais nova (aparelho manda pacotes atrasados).
    if (!v.ultima_posicao_em || new Date(quando) >= new Date(v.ultima_posicao_em)) {
      await db.from('rastreio_veiculos').update({
        ultima_lat: pos.latitude, ultima_lng: pos.longitude, ultima_velocidade: kmh, ultimo_curso: pos.course ?? null,
        ...(ignicao !== null ? { ignicao } : {}),
        ...(attrs.power != null ? { bateria_externa: Number(attrs.power) } : {}),
        ...(typeof attrs.blocked === 'boolean' ? { bloqueado: attrs.blocked } : {}),
        ultima_posicao_em: quando, ultima_comunicacao_em: agora,
        ...(!v.traccar_device_id && corpo.device?.id ? { traccar_device_id: corpo.device.id } : {}),
      }).eq('id', v.id);
    }
  } else {
    await db.from('rastreio_veiculos').update({ ultima_comunicacao_em: agora }).eq('id', v.id);
  }

  const ev = corpo.event;
  if (ev?.type && TEXTO_EVENTO[ev.type]) {
    const r = TEXTO_EVENTO[ev.type](v.placa, ev.attributes || {});
    if (r) {
      await db.from('rastreio_eventos').insert({
        empresa_id: v.empresa_id, veiculo_id: v.id, tipo: r[0], mensagem: r[1],
        lat: pos?.latitude ?? null, lng: pos?.longitude ?? null, ocorrido_em: ev.eventTime || agora,
      });
      feito.push(`evento ${ev.type}`);
    }
  }
  return `${v.placa}: ${feito.join(', ') || 'comunicação'}`;
}

/** Usuário logado (Bearer do Supabase) com empresa e cargo — para as rotas do módulo. */
export async function usuarioRastreio(db: SupabaseClient, req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id, nome, cargo').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return null;
  const { data: empresa } = await db.from('empresas').select('modulos').eq('id', perfil.empresa_id).maybeSingle();
  if (!(empresa?.modulos as Record<string, unknown> | null)?.rastreio) return null;
  return { id: user.id, nome: perfil.nome || user.email || 'usuário', cargo: perfil.cargo as string | null, empresaId: perfil.empresa_id as string };
}
