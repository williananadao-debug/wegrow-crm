import { NextResponse } from 'next/server';
import { dbAdmin, enviarLinkAcesso, portalAtivo, urlBase } from '@/lib/portal-cliente';

export const dynamic = 'force-dynamic';

// Cliente digita o e-mail na tela do portal → se for de um cliente com venda fechada numa
// empresa com o portal ligado, manda o link de acesso. A resposta é SEMPRE a mesma (exista
// ou não o e-mail), pra ninguém usar essa tela pra descobrir quem é cliente de quem.
export async function POST(req: Request) {
  const resposta = NextResponse.json({ ok: true, mensagem: 'Se este e-mail estiver cadastrado, você vai receber o link de acesso em instantes.' });
  let email = '';
  try { email = String((await req.json())?.email || '').trim().toLowerCase(); } catch { /* corpo inválido */ }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return NextResponse.json({ ok: false, erro: 'Informe um e-mail válido.' }, { status: 400 });
  }

  const db = dbAdmin();
  // ilike sem curinga = comparação sem diferenciar maiúscula; escapa % e _ do próprio e-mail.
  const { data: clientes } = await db.from('clientes')
    .select('id, nome_empresa, email, empresa_id')
    .ilike('email', email.replace(/[%_\\]/g, c => `\\${c}`))
    .limit(10);
  if (!clientes?.length) return resposta;

  const base = urlBase(req);
  for (const c of clientes) {
    const { data: empresa } = await db.from('empresas').select('id, nome, logo_url, cor_primaria, modulos').eq('id', c.empresa_id).maybeSingle();
    if (!empresa || !portalAtivo(empresa.modulos)) continue;
    const { count } = await db.from('leads').select('id', { count: 'exact', head: true })
      .eq('empresa_id', c.empresa_id).eq('client_id', c.id).eq('status', 'ganho');
    if (!count) continue;
    try {
      await enviarLinkAcesso(db, { empresa, clienteId: c.id, nomeCliente: c.nome_empresa, email, base, convite: false });
    } catch (e) {
      console.error('[portal-cliente/entrar]', e);
    }
  }
  return resposta;
}
