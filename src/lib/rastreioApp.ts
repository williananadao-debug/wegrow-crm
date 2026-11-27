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

// Acesso extra (PJ: motorista, gestor): nome de quem usa, veículos permitidos (nulo = todos) e
// se pode bloquear. Sem "extra" = acesso do titular (todos os veículos, pode bloquear).
export type AcessoExtra = { nome: string; veiculoIds: string[] | null; podeBloquear: boolean };

export async function criarConvite(db: SupabaseClient, p: { empresaId: string; clienteId: string; criadoPor: string; extra?: AcessoExtra }) {
  const token = novoToken();
  const { error } = await db.from('rastreio_app_convites').insert({
    empresa_id: p.empresaId, cliente_id: p.clienteId, token_hash: hashToken(token), criado_por: p.criadoPor,
    expira_em: new Date(Date.now() + CONVITE_DIAS * 86400_000).toISOString(),
    ...(p.extra ? { nome: p.extra.nome, veiculo_ids: p.extra.veiculoIds?.length ? p.extra.veiculoIds : null, pode_bloquear: p.extra.podeBloquear } : {}),
  });
  if (error) throw new Error('Não foi possível gerar o convite agora.');
  return token;
}

/** Troca o convite (uso único) por uma sessão. Retorna o valor do cookie ou null. */
export async function trocarConvite(db: SupabaseClient, token: string, dispositivo?: string): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const { data: c } = await db.from('rastreio_app_convites').select('id, empresa_id, cliente_id, expira_em, usado_em, nome, veiculo_ids, pode_bloquear')
    .eq('token_hash', hashToken(token)).maybeSingle();
  if (!c || c.usado_em || new Date(c.expira_em).getTime() < Date.now()) return null;
  // Marca como usado antes de criar a sessão (corrida de dois cliques: só um vence).
  const { data: marcado } = await db.from('rastreio_app_convites').update({ usado_em: new Date().toISOString() })
    .eq('id', c.id).is('usado_em', null).select('id').maybeSingle();
  if (!marcado) return null;
  return criarSessao(db, { empresaId: c.empresa_id, clienteId: c.cliente_id, nome: c.nome, veiculoIds: c.veiculo_ids, podeBloquear: c.pode_bloquear ?? true, dispositivo });
}

export async function criarSessao(db: SupabaseClient, p: { empresaId: string; clienteId: string; nome?: string | null; veiculoIds?: string[] | null; podeBloquear?: boolean; dispositivo?: string }) {
  const sessao = novoToken();
  await db.from('rastreio_app_sessoes').insert({
    empresa_id: p.empresaId, cliente_id: p.clienteId, sessao_hash: hashToken(sessao),
    expira_em: new Date(Date.now() + SESSAO_DIAS * 86400_000).toISOString(), ultimo_acesso: new Date().toISOString(),
    nome: p.nome ?? null, veiculo_ids: p.veiculoIds ?? null, pode_bloquear: p.podeBloquear ?? true, dispositivo: descreverDispositivo(p.dispositivo),
  });
  return sessao;
}

// Login permanente do titular: CPF/CNPJ (ou celular, se não tiver documento) + senha gerada pelo
// sistema. A senha só aparece na hora de gerar; no banco fica o scrypt.
export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export function loginDoCliente(c: { documento?: string | null; telefone?: string | null }) {
  const doc = soDigitos(c.documento);
  if (doc.length === 11 || doc.length === 14) return doc;
  const fone = soDigitos(c.telefone).replace(/^55(?=\d{10,11}$)/, '');
  return fone.length >= 10 ? fone : null;
}
export function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyz', nums = '23456789';
  const b = randomBytes(8);
  return Array.from(b.subarray(0, 4), x => letras[x % letras.length]).join('') + Array.from(b.subarray(4), x => nums[x % nums.length]).join('');
}
export function hashSenha(senha: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(senha, salt, 32).toString('hex')}`;
}
export function confereSenha(senha: string, guardado: string | null) {
  if (!guardado || !senha) return false;
  const [salt, hash] = guardado.split(':');
  const calc = scryptSync(senha, salt, 32);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calc.length && timingSafeEqual(calc, esperado);
}

/** "Android · Chrome", "iPhone · Safari"... para o instalador reconhecer o celular na lista de acessos. */
function descreverDispositivo(ua?: string) {
  if (!ua) return null;
  const so = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Outro';
  const nav = /wv\)|WeGrowRastreio/.test(ua) ? 'app' : /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'navegador';
  return `${so} · ${nav}`;
}

export type SessaoApp = {
  id: number; empresaId: string; clienteId: string;
  /** Nome de quem usa (acesso extra) ou null (titular). */
  nome: string | null;
  /** Veículos permitidos; null = todos do cliente. */
  veiculoIds: string[] | null;
  podeBloquear: boolean;
};

/** Restringe uma consulta de rastreio_veiculos (ou tabela com veiculo_id) ao que a sessão pode ver. */
export function soVeiculosDaSessao<Q>(q: Q, s: SessaoApp, coluna = 'id'): Q {
  type Filtro = { eq: (c: string, v: string) => Filtro; in: (c: string, v: string[]) => Filtro };
  const base = (q as unknown as Filtro).eq('cliente_id', s.clienteId).eq('empresa_id', s.empresaId);
  return (s.veiculoIds ? base.in(coluna, s.veiculoIds) : base) as unknown as Q;
}

/** O veículo está liberado para esta sessão? (para rotas que recebem veiculoId) */
export const veiculoLiberado = (s: SessaoApp, veiculoId: string) => !s.veiculoIds || s.veiculoIds.includes(veiculoId);

export async function obterSessaoApp(db: SupabaseClient, cookie: string | undefined): Promise<SessaoApp | null> {
  if (!cookie) return null;
  const { data: s } = await db.from('rastreio_app_sessoes').select('id, empresa_id, cliente_id, expira_em, ultimo_acesso, nome, veiculo_ids, pode_bloquear, revogado_em')
    .eq('sessao_hash', hashToken(cookie)).maybeSingle();
  if (!s || s.revogado_em || new Date(s.expira_em).getTime() < Date.now()) return null;
  // Cliente cancelado perde o acesso; suspenso (inadimplente) continua vendo, mas a tela avisa.
  const { data: cli } = await db.from('rastreio_clientes').select('status').eq('id', s.cliente_id).maybeSingle();
  if (!cli || cli.status === 'cancelado') return null;
  if (!s.ultimo_acesso || Date.now() - new Date(s.ultimo_acesso).getTime() > 3600_000) {
    const agora = new Date().toISOString();
    await db.from('rastreio_app_sessoes').update({ ultimo_acesso: agora, expira_em: new Date(Date.now() + SESSAO_DIAS * 86400_000).toISOString() }).eq('id', s.id);
    await db.from('rastreio_clientes').update({ app_ultimo_acesso: agora }).eq('id', s.cliente_id);
  }
  return {
    id: s.id, empresaId: s.empresa_id, clienteId: s.cliente_id, nome: s.nome || null,
    veiculoIds: Array.isArray(s.veiculo_ids) && s.veiculo_ids.length ? s.veiculo_ids : null, podeBloquear: s.pode_bloquear !== false,
  };
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

// Link de localização ao vivo (família, polícia, seguradora). Expira sozinho; só o hash fica no banco.
export const HORAS_COMPARTILHAR = [1, 8, 24, 72] as const;

export async function criarCompartilhamento(
  db: SupabaseClient, p: { empresaId: string; veiculoId: string; horas: number; criadoPor: string; origem: 'painel' | 'app' },
) {
  const horas = (HORAS_COMPARTILHAR as readonly number[]).includes(p.horas) ? p.horas : 1;
  const token = novoToken();
  const expira = new Date(Date.now() + horas * 3600_000).toISOString();
  const { error } = await db.from('rastreio_compartilhamentos').insert({
    empresa_id: p.empresaId, veiculo_id: p.veiculoId, token_hash: hashToken(token), expira_em: expira, criado_por: p.criadoPor, origem: p.origem,
  });
  if (error) throw new Error('Não foi possível criar o link agora.');
  return { token, expira };
}
