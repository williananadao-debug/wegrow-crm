// Módulo Rastreio — lado servidor. Os rastreadores falam com o Traccar (VPS, TCP); o Traccar
// repassa posições e eventos para /api/rastreio/traccar e recebe os comandos de bloqueio pela
// API REST dele. Variáveis (Vercel):
//   TRACCAR_URL            ex.: https://rastreio.wegrow.app.br  (sem barra no fim)
//   TRACCAR_USER / TRACCAR_PASSWORD   usuário admin do Traccar
//   TRACCAR_WEBHOOK_TOKEN  segredo que vai na URL do forward (?token=...)
import type { SupabaseClient } from '@supabase/supabase-js';
import { notificarCliente } from '@/lib/rastreioPush';

type NovoEvento = {
  empresa_id: string; veiculo_id: string; tipo: string; mensagem: string;
  lat?: number | null; lng?: number | null; ocorrido_em?: string; lido?: boolean;
};

const TITULO_ALERTA: Record<string, string> = {
  alarme: '🚨 Alerta do rastreador', cerca: '📍 Cerca virtual', velocidade: '⚠️ Excesso de velocidade',
  comando: '🔒 Bloqueio', offline: '📡 Rastreador sem sinal', online: '📡 Rastreador voltou', manutencao: '🔧 Manutenção',
  ignicao_ligada: '🔑 Ignição ligada', ignicao_desligada: '🔑 Ignição desligada',
};

/** Grava o alerta e avisa o celular do dono do veículo (se ele quiser esse tipo de alerta). */
export async function registrarEvento(db: SupabaseClient, ev: NovoEvento) {
  await db.from('rastreio_eventos').insert(ev);
  try {
    const { data: v } = await db.from('rastreio_veiculos').select('cliente_id').eq('id', ev.veiculo_id).maybeSingle();
    if (v?.cliente_id) {
      await notificarCliente(db, { clienteId: v.cliente_id, tipo: ev.tipo, titulo: TITULO_ALERTA[ev.tipo] || 'Rastreamento', corpo: ev.mensagem, veiculoId: ev.veiculo_id });
    }
  } catch (e) {
    console.error('[rastreio/push]', (e as Error).message); // alerta já gravado; push é bônus
  }
}

// Bloqueio só com o veículo parado ou quase: cortar combustível em movimento causa acidente.
export const VELOCIDADE_MAX_BLOQUEIO = 20; // km/h
// Posição mais velha que isso não serve para garantir que o veículo está devagar.
export const POSICAO_RECENTE_MIN = 10;

const NOS_PARA_KMH = 1.852; // o Traccar manda velocidade em nós

export function traccarConfigurado() {
  return Boolean(process.env.TRACCAR_URL && process.env.TRACCAR_USER && process.env.TRACCAR_PASSWORD);
}

async function traccar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown) {
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

export async function removerDispositivoTraccar(deviceId: number) {
  await traccar('DELETE', `/devices/${deviceId}`);
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
        await registrarEvento(db, {
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
        // Sensores (cada tipo de pacote do GT06 traz uma parte: só sobrescreve o que veio).
        ...(attrs.sat != null ? { satelites: Number(attrs.sat) } : {}),
        ...(attrs.rssi != null ? { sinal_gsm: Number(attrs.rssi) } : {}),
        ...(attrs.batteryLevel != null ? { bateria_interna: Math.round(Number(attrs.batteryLevel)) } : {}),
        ...(typeof attrs.charge === 'boolean' ? { carregando: attrs.charge } : {}),
        ultima_posicao_em: quando, ultima_comunicacao_em: agora,
        ...(!v.traccar_device_id && corpo.device?.id ? { traccar_device_id: corpo.device.id } : {}),
      }).eq('id', v.id);
      if (!corpo.event) {
        const cercas = await verificarCercas(db, v, pos.latitude, pos.longitude, quando);
        if (cercas) feito.push(cercas);
      }
    }
  } else {
    await db.from('rastreio_veiculos').update({ ultima_comunicacao_em: agora }).eq('id', v.id);
  }

  const ev = corpo.event;
  if (ev?.type && TEXTO_EVENTO[ev.type]) {
    const r = TEXTO_EVENTO[ev.type](v.placa, ev.attributes || {});
    if (r) {
      await registrarEvento(db, {
        empresa_id: v.empresa_id, veiculo_id: v.id, tipo: r[0], mensagem: r[1],
        lat: pos?.latitude ?? null, lng: pos?.longitude ?? null, ocorrido_em: ev.eventTime || agora,
      });
      feito.push(`evento ${ev.type}`);
    }
  }
  return `${v.placa}: ${feito.join(', ') || 'comunicação'}`;
}

/** Cercas virtuais (círculos) do veículo: avisa só quando troca de dentro↔fora. */
async function verificarCercas(
  db: SupabaseClient, v: { id: string; empresa_id: string; placa: string }, lat: number, lng: number, quando: string,
): Promise<string | null> {
  const { data: cercas, error } = await db.from('rastreio_cercas').select('id, nome, lat, lng, raio_m, dentro, tipo, poligono')
    .eq('veiculo_id', v.id).eq('ativo', true).limit(50);
  if (error || !cercas?.length) return null;
  const avisos: string[] = [];
  for (const c of cercas) {
    const pertoDoCentro = distanciaMetros(lat, lng, c.lat, c.lng) <= c.raio_m;
    const dentro = c.tipo === 'poligono' && Array.isArray(c.poligono)
      ? pertoDoCentro && pontoNoPoligono(lat, lng, c.poligono as [number, number][])
      : pertoDoCentro;
    if (c.dentro === dentro) continue;
    await db.from('rastreio_cercas').update({ dentro }).eq('id', c.id);
    if (c.dentro === null) continue; // primeira leitura: só registra o estado
    await registrarEvento(db, {
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'cerca',
      mensagem: `${v.placa}: ${dentro ? 'entrou em' : 'saiu de'} ${c.nome}`, lat, lng, ocorrido_em: quando,
    });
    avisos.push(`cerca ${c.nome}`);
  }
  return avisos.join(', ') || null;
}

/** Ray casting: o ponto está dentro do polígono [[lat,lng],...]? */
export function pontoNoPoligono(lat: number, lng: number, pol: [number, number][]) {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [yi, xi] = pol[i], [yj, xj] = pol[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = Math.PI / 180;
  const h = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

/** Situação do aparelho no Traccar (status, última conexão, protocolo) — para o diagnóstico. */
export async function diagnosticoTraccar(imei: string) {
  const busca = await traccar('GET', `/devices?uniqueId=${encodeURIComponent(imei)}`);
  const d = Array.isArray(busca.dados) ? busca.dados[0] : null;
  if (!d) return { cadastrado: false as const };
  let posicao: { protocol?: string; fixTime?: string; valid?: boolean; attributes?: Record<string, unknown> } | null = null;
  if (d.positionId) {
    const p = await traccar('GET', `/positions?id=${d.positionId}`).catch(() => null);
    posicao = Array.isArray(p?.dados) ? p.dados[0] : null;
  }
  return {
    cadastrado: true as const, deviceId: d.id as number, status: String(d.status || 'unknown'),
    ultimaConexao: (d.lastUpdate as string | null) || null,
    protocolo: posicao?.protocol || null, ultimoGps: posicao?.fixTime || null, gpsValido: posicao?.valid ?? null,
    satelites: posicao?.attributes?.sat != null ? Number(posicao.attributes.sat) : null,
    sinal: posicao?.attributes?.rssi != null ? Number(posicao.attributes.rssi) : null,
  };
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

// ── Comando de bloqueio (painel e app do cliente usam a mesma regra) ────────────────────────

type Autor = { userId: string | null; nome: string; origem: 'painel' | 'app' };

/** Aplica as travas, envia ao Traccar e registra tudo (inclusive recusas). */
export async function executarComando(
  db: SupabaseClient,
  p: { veiculoId: string; empresaId: string; clienteId?: string; tipo: 'bloquear' | 'desbloquear'; motivo: string; autor: Autor },
): Promise<{ ok: true; naFila: boolean; mensagem: string } | { ok: false; erro: string; status: number }> {
  let q = db.from('rastreio_veiculos')
    .select('id, empresa_id, cliente_id, placa, imei, tem_bloqueio, traccar_device_id, ultima_velocidade, ultima_posicao_em, ultima_lat, ultima_lng')
    .eq('id', p.veiculoId).eq('empresa_id', p.empresaId).eq('status', 'ativo');
  if (p.clienteId) q = q.eq('cliente_id', p.clienteId);
  const { data: v } = await q.maybeSingle();
  if (!v) return { ok: false, erro: 'Veículo não encontrado.', status: 404 };

  const motivo = p.motivo.trim().slice(0, 300);
  const log = (status: 'enviado' | 'recusado' | 'erro', detalhe: string) => db.from('rastreio_comandos').insert({
    empresa_id: v.empresa_id, veiculo_id: v.id, tipo: p.tipo, status, motivo, detalhe, origem: p.autor.origem,
    velocidade_no_momento: v.ultima_velocidade, lat: v.ultima_lat, lng: v.ultima_lng, user_id: p.autor.userId, user_nome: p.autor.nome,
  });
  const recusar = async (erro: string, status = 409) => { await log('recusado', erro); return { ok: false as const, erro, status }; };

  if (!motivo) return { ok: false, erro: 'Informe o motivo.', status: 400 };
  if (!v.tem_bloqueio) return recusar('Este veículo não tem relé de bloqueio instalado.');
  if (p.tipo === 'bloquear') {
    const idadeMin = v.ultima_posicao_em ? (Date.now() - new Date(v.ultima_posicao_em).getTime()) / 60000 : Infinity;
    if (idadeMin > POSICAO_RECENTE_MIN) {
      return recusar(`Última posição tem mais de ${POSICAO_RECENTE_MIN} min — sem como garantir que o veículo está parado. Aguarde o rastreador comunicar ou ligue para a central.`);
    }
    if (Number(v.ultima_velocidade || 0) > VELOCIDADE_MAX_BLOQUEIO) {
      return recusar(`Veículo a ${v.ultima_velocidade} km/h. Por segurança o bloqueio só é enviado abaixo de ${VELOCIDADE_MAX_BLOQUEIO} km/h.`);
    }
  }
  if (!traccarConfigurado()) return recusar('Servidor de rastreio ainda não configurado.', 503);

  try {
    let deviceId = v.traccar_device_id as number | null;
    if (!deviceId) {
      deviceId = await garantirDispositivoTraccar(v.imei, v.placa);
      await db.from('rastreio_veiculos').update({ traccar_device_id: deviceId }).eq('id', v.id);
    }
    const { naFila } = await enviarComandoTraccar(deviceId, p.tipo);
    const mensagem = naFila ? 'Aparelho sem sinal agora: o comando fica na fila e executa quando ele comunicar.' : 'Comando entregue ao aparelho.';
    await log('enviado', mensagem);
    await db.from('rastreio_veiculos').update({ bloqueado: p.tipo === 'bloquear' }).eq('id', v.id);
    await registrarEvento(db, {
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'comando', lido: p.autor.origem === 'painel',
      mensagem: `${v.placa}: ${p.tipo === 'bloquear' ? 'BLOQUEIO' : 'desbloqueio'} enviado por ${p.autor.nome}${p.autor.origem === 'app' ? ' (app do cliente)' : ''} — ${motivo}`,
      lat: v.ultima_lat, lng: v.ultima_lng,
    });
    return { ok: true, naFila, mensagem };
  } catch (err) {
    const msg = (err as Error).message;
    await log('erro', msg);
    return { ok: false, erro: `Falha ao enviar: ${msg}`, status: 502 };
  }
}
