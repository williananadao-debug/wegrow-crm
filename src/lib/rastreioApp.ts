// App do cliente final do Rastreio (/meu-rastreio) — helpers de servidor.
// Mesmo modelo do Portal do Cliente: o cliente não é usuário do Supabase Auth. O instalador
// gera um link de convite de uso único (manda pelo WhatsApp); o link vira uma sessão em cookie
// httpOnly. Toda leitura passa pelo servidor com service role filtrando pelo cliente da sessão.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const COOKIE_APP = 'wg_rastreio_app';
export const SESSAO_DIAS = 365;   // deslizante: cada uso empurra +365 dias
export const CONVITE_DIAS = 7;

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const novoToken = () => randomBytes(32).toString('base64url');

export function urlBase(req: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, '');
}

export function opcoesCookie() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSAO_DIAS * 86400 };
}

export async function criarConvite(db: SupabaseClient, p: { empresaId: string; clienteId: string; criadoPor: string }) {
  const token = novoToken();
  await db.from('rastreio_app_convites').insert({
    empresa_id: p.empresaId, cliente_id: p.clienteId, token_hash: hashToken(token), criado_por: p.criadoPor,
    expira_em: new Date(Date.now() + CONVITE_DIAS * 86400_000).toISOString(),
  });
  return token;
}

/** Troca o convite (uso único) por uma sessão. Retorna o valor do cookie ou null. */
export async function trocarConvite(db: SupabaseClient, token: string): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const { data: c } = await db.from('rastreio_app_convites').select('id, empresa_id, cliente_id, expira_em, usado_em')
    .eq('token_hash', hashToken(token)).maybeSingle();
  if (!c || c.usado_em || new Date(c.expira_em).getTime() < Date.now()) return null;
  // Marca como usado antes de criar a sessão (corrida de dois cliques: só um vence).
  const { data: marcado } = await db.from('rastreio_app_convites').update({ usado_em: new Date().toISOString() })
    .eq('id', c.id).is('usado_em', null).select('id').maybeSingle();
  if (!marcado) return null;
  const sessao = novoToken();
  await db.from('rastreio_app_sessoes').insert({
    empresa_id: c.empresa_id, cliente_id: c.cliente_id, sessao_hash: hashToken(sessao),
    expira_em: new Date(Date.now() + SESSAO_DIAS * 86400_000).toISOString(), ultimo_acesso: new Date().toISOString(),
  });
  return sessao;
}

export type SessaoApp = { id: number; empresaId: string; clienteId: string };

export async function obterSessaoApp(db: SupabaseClient, cookie: string | undefined): Promise<SessaoApp | null> {
  if (!cookie) return null;
  const { data: s } = await db.from('rastreio_app_sessoes').select('id, empresa_id, cliente_id, expira_em, ultimo_acesso')
    .eq('sessao_hash', hashToken(cookie)).maybeSingle();
  if (!s || new Date(s.expira_em).getTime() < Date.now()) return null;
  // Cliente cancelado perde o acesso; suspenso (inadimplente) continua vendo, mas a tela avisa.
  const { data: cli } = await db.from('rastreio_clientes').select('status').eq('id', s.cliente_id).maybeSingle();
  if (!cli || cli.status === 'cancelado') return null;
  if (!s.ultimo_acesso || Date.now() - new Date(s.ultimo_acesso).getTime() > 3600_000) {
    const agora = new Date().toISOString();
    await db.from('rastreio_app_sessoes').update({ ultimo_acesso: agora, expira_em: new Date(Date.now() + SESSAO_DIAS * 86400_000).toISOString() }).eq('id', s.id);
    await db.from('rastreio_clientes').update({ app_ultimo_acesso: agora }).eq('id', s.cliente_id);
  }
  return { id: s.id, empresaId: s.empresa_id, clienteId: s.cliente_id };
}

// PIN de bloqueio (4 a 6 dígitos), guardado como scrypt "salt:hash".
export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}
export function conferePin(pin: string, guardado: string | null) {
  if (!guardado || !/^\d{4,6}$/.test(pin)) return false;
  const [salt, hash] = guardado.split(':');
  const calc = scryptSync(pin, salt, 32);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calc.length && timingSafeEqual(calc, esperado);
}
export const pinValido = (pin: unknown) => typeof pin === 'string' && /^\d{4,6}$/.test(pin);
