// Notificação no celular do cliente final (app nativo WeGrow Rastreio) via Firebase Cloud
// Messaging HTTP v1 — o mesmo canal entrega Android e iPhone (APNs configurado no Firebase).
// Variável (Vercel): FIREBASE_SERVICE_ACCOUNT = JSON da conta de serviço do projeto Firebase.
// Sem ela, nada é enviado (o alerta continua aparecendo no app e no painel).
import { createSign } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type ContaServico = { project_id: string; client_email: string; private_key: string };

// Alertas que o cliente recebe no celular por padrão (pode mudar no app).
export const ALERTAS_PADRAO: Record<string, boolean> = {
  alarme: true, cerca: true, velocidade: true, comando: true, offline: true, manutencao: true,
  ignicao_ligada: false, ignicao_desligada: false,
};
export const NOMES_ALERTA: Record<string, string> = {
  alarme: 'Alarmes (bateria cortada, violação, pânico)', cerca: 'Entrada e saída de cercas', velocidade: 'Excesso de velocidade',
  comando: 'Bloqueio e desbloqueio', offline: 'Rastreador sem comunicação', manutencao: 'Manutenção vencendo',
  ignicao_ligada: 'Ignição ligada', ignicao_desligada: 'Ignição desligada',
};

let cacheToken: { valor: string; expira: number } | null = null;

function conta(): ContaServico | null {
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) return null;
  try {
    const c = JSON.parse(bruto);
    return c.project_id && c.client_email && c.private_key ? { ...c, private_key: String(c.private_key).replace(/\\n/g, '\n') } : null;
  } catch { return null; }
}

export const pushConfigurado = () => Boolean(conta());

async function tokenGoogle(c: ContaServico) {
  if (cacheToken && cacheToken.expira > Date.now() + 60_000) return cacheToken.valor;
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const corpo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: c.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
  })}`;
  const assinatura = createSign('RSA-SHA256').update(corpo).sign(c.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${corpo}.${assinatura}` }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Google OAuth: ${j.error_description || j.error || r.status}`);
  cacheToken = { valor: j.access_token, expira: Date.now() + Number(j.expires_in || 3600) * 1000 };
  return cacheToken.valor;
}

/** Manda o alerta para os celulares do cliente, respeitando as preferências dele. */
export async function notificarCliente(
  db: SupabaseClient, p: { clienteId: string; tipo: string; titulo: string; corpo: string; veiculoId?: string },
) {
  const c = conta();
  if (!c) return 0;
  const { data: cli } = await db.from('rastreio_clientes').select('app_alertas, status').eq('id', p.clienteId).maybeSingle();
  if (!cli || cli.status === 'cancelado') return 0;
  const prefs = { ...ALERTAS_PADRAO, ...((cli.app_alertas as Record<string, boolean> | null) || {}) };
  if (!prefs[p.tipo]) return 0;
  const { data: todos } = await db.from('rastreio_push_tokens').select('id, token, sessao_id').eq('cliente_id', p.clienteId).limit(20);
  if (!todos?.length) return 0;
  // Celular de acesso extra: só alerta de veículo liberado; sessão revogada não recebe mais.
  const idsSessao = [...new Set(todos.map(t => t.sessao_id).filter(Boolean))] as number[];
  const { data: sessoes } = idsSessao.length
    ? await db.from('rastreio_app_sessoes').select('id, veiculo_ids, revogado_em').in('id', idsSessao)
    : { data: [] };
  const porId = new Map((sessoes || []).map(s => [s.id as number, s]));
  const tokens = todos.filter(t => {
    if (!t.sessao_id) return true;
    const s = porId.get(t.sessao_id);
    if (!s || s.revogado_em) return false;
    const ids = s.veiculo_ids as string[] | null;
    return !ids?.length || !p.veiculoId || ids.includes(p.veiculoId);
  });
  if (!tokens.length) return 0;

  const acesso = await tokenGoogle(c);
  let enviados = 0;
  for (const t of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: t.token,
          notification: { title: p.titulo, body: p.corpo },
          data: { tipo: p.tipo, veiculoId: p.veiculoId || '' },
          android: { priority: p.tipo === 'alarme' ? 'HIGH' : 'NORMAL', notification: { channel_id: p.tipo === 'alarme' ? 'alarmes' : 'alertas' } },
          apns: { payload: { aps: { sound: 'default', ...(p.tipo === 'alarme' ? { 'interruption-level': 'time-sensitive' } : {}) } } },
        },
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!r) continue;
    if (r.ok) { enviados++; continue; }
    // Token morto (app desinstalado / trocado): remove para não tentar de novo.
    const erro = await r.text().catch(() => '');
    if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(erro)) await db.from('rastreio_push_tokens').delete().eq('id', t.id);
  }
  return enviados;
}
