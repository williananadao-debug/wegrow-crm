// Portal do Cliente — helpers de servidor (só usar em route handlers).
//
// Segurança: o cliente final não é usuário do Supabase Auth. Login é por link mágico de uso
// único (token aleatório, só o hash fica no banco, expira) que troca por uma sessão em cookie
// httpOnly. Toda leitura de dado passa por aqui com service role e é filtrada pelo
// cliente_id/empresa_id da sessão — nunca por id vindo da URL sem conferir o dono.
import { createHash, randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const COOKIE_SESSAO = 'wg_portal_sessao';
export const SESSAO_DIAS = 30;
const LOGIN_MINUTOS = 30;          // link pedido na tela de login
const CONVITE_DIAS = 7;            // link do e-mail de boas-vindas (cliente pode demorar a abrir)
const MAX_LINKS_POR_HORA = 5;

export function dbAdmin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const novoToken = () => randomBytes(32).toString('base64url');

export function portalAtivo(modulos: Record<string, unknown> | null | undefined) {
  return Boolean(modulos?.portal_cliente);
}

export function urlBase(req: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, '');
}

export type SessaoPortal = { id: number; empresa_id: string; cliente_id: number; email: string };

export async function obterSessao(db: SupabaseClient, cookieValor: string | undefined): Promise<SessaoPortal | null> {
  if (!cookieValor) return null;
  const { data } = await db.from('portal_cliente_sessoes')
    .select('id, empresa_id, cliente_id, email, expira_em, ultimo_acesso')
    .eq('sessao_hash', hashToken(cookieValor)).maybeSingle();
  if (!data || new Date(data.expira_em).getTime() < Date.now()) return null;
  // Atualiza "último acesso" no máximo 1x por hora — não precisa escrever a cada request.
  if (!data.ultimo_acesso || Date.now() - new Date(data.ultimo_acesso).getTime() > 3600_000) {
    await db.from('portal_cliente_sessoes').update({ ultimo_acesso: new Date().toISOString() }).eq('id', data.id);
  }
  return { id: data.id, empresa_id: data.empresa_id, cliente_id: data.cliente_id, email: data.email };
}

export async function criarSessao(db: SupabaseClient, d: { empresa_id: string; cliente_id: number; email: string }) {
  const valor = novoToken();
  const expira = new Date(Date.now() + SESSAO_DIAS * 86400_000);
  const { error } = await db.from('portal_cliente_sessoes').insert([{ ...d, sessao_hash: hashToken(valor), expira_em: expira.toISOString() }]);
  if (error) throw error;
  return { valor, expira };
}

type EmpresaPortal = { id: string; nome: string | null; logo_url?: string | null; cor_primaria?: string | null };

function escapar(t: string) {
  return t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Cria um link de acesso de uso único e manda por e-mail. `convite` = e-mail de boas-vindas
// enviado ao fechar a venda (texto diferente e validade maior).
export async function enviarLinkAcesso(db: SupabaseClient, opts: {
  empresa: EmpresaPortal; clienteId: number; nomeCliente: string; email: string; base: string; convite: boolean;
}) {
  const email = opts.email.trim().toLowerCase();

  // Limite simples contra abuso (alguém martelando "me mande o link" pro e-mail de outro).
  const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from('portal_cliente_tokens').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', umaHoraAtras);
  if (!opts.convite && (count || 0) >= MAX_LINKS_POR_HORA) return { ok: false as const, motivo: 'limite' };

  const token = novoToken();
  const expira = new Date(Date.now() + (opts.convite ? CONVITE_DIAS * 86400_000 : LOGIN_MINUTOS * 60_000));
  const { error } = await db.from('portal_cliente_tokens').insert([{
    empresa_id: opts.empresa.id, cliente_id: opts.clienteId, email,
    token_hash: hashToken(token), expira_em: expira.toISOString(),
  }]);
  if (error) throw error;

  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurada.');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const link = `${opts.base}/acompanhar/entrar?t=${encodeURIComponent(token)}`;
  const cor = opts.empresa.cor_primaria || '#22C55E';
  const nomeEmpresa = escapar(opts.empresa.nome || 'nossa empresa');
  const primeiroNome = escapar((opts.nomeCliente || '').split(' ')[0] || 'cliente');
  const titulo = opts.convite ? `Acompanhe seu pedido na ${opts.empresa.nome || 'fábrica'}` : `Seu link de acesso — ${opts.empresa.nome || 'Portal do Cliente'}`;
  const corpo = opts.convite
    ? `Seu pedido foi confirmado! A partir de agora você acompanha tudo por aqui: <b>etapas e fotos da produção</b>, <b>parcelas e boletos</b> e o <b>contrato</b> — sem precisar pedir pelo WhatsApp.`
    : `Recebemos seu pedido de acesso ao Portal do Cliente. Clique no botão abaixo para entrar.`;
  const validade = opts.convite ? `Este link vale por ${CONVITE_DIAS} dias. Depois disso, é só entrar no portal e pedir um link novo com o seu e-mail.` : `Este link vale por ${LOGIN_MINUTOS} minutos e só pode ser usado uma vez.`;

  const { error: erroEmail } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
    to: email,
    subject: titulo,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
      ${opts.empresa.logo_url ? `<img src="${escapar(opts.empresa.logo_url)}" alt="${nomeEmpresa}" style="max-height:48px;margin-bottom:16px">` : `<p style="font-weight:800;font-size:18px;margin:0 0 16px">${nomeEmpresa}</p>`}
      <p style="font-size:16px">Olá, ${primeiroNome}!</p>
      <p style="font-size:15px;line-height:1.5">${corpo}</p>
      <p style="margin:28px 0"><a href="${link}" style="background:${escapar(cor)};color:#0b1120;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:10px;display:inline-block">Acessar meu portal</a></p>
      <p style="font-size:12px;color:#64748b;line-height:1.5">${validade}<br>Se você não esperava este e-mail, pode ignorá-lo.</p>
    </div>`,
  });
  if (erroEmail) throw new Error(erroEmail.message);
  return { ok: true as const };
}

export { planoPagamento, type ParcelaPortal } from './planoPagamento';
