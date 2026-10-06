import { NextResponse } from 'next/server';
import { dbAdmin, enviarLinkAcesso, portalAtivo, urlBase } from '@/lib/portal-cliente';

export const dynamic = 'force-dynamic';

// Manda o e-mail de boas-vindas do Portal do Cliente pra uma venda. Chamado sozinho quando a
// venda fecha (Nova Venda / conversão de orçamento / Pipeline → Ganho) e pelo botão
// "Enviar acesso ao portal". Sem `reenviar`, não manda de novo pra venda que já recebeu.
// Resposta { enviado: false, motivo } quando não se aplica (portal desligado, cliente sem
// e-mail...) — não é erro, a tela só mostra o motivo quando foi clique manual.
export async function POST(req: Request) {
  const db = dbAdmin();
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(accessToken);
  if (!user) return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 403 });

  let leadId = 0; let reenviar = false;
  try { const b = await req.json(); leadId = Number(b?.leadId); reenviar = Boolean(b?.reenviar); } catch { /* corpo inválido */ }
  if (!Number.isInteger(leadId) || leadId <= 0) return NextResponse.json({ erro: 'Venda inválida.' }, { status: 400 });

  const { data: empresa } = await db.from('empresas').select('id, nome, logo_url, cor_primaria, modulos').eq('id', perfil.empresa_id).maybeSingle();
  if (!empresa || !portalAtivo(empresa.modulos)) return NextResponse.json({ enviado: false, motivo: 'O Portal do Cliente não está ativo pra sua empresa.' });

  const { data: lead } = await db.from('leads').select('id, status, client_id, portal_convite_enviado_em')
    .eq('id', leadId).eq('empresa_id', perfil.empresa_id).maybeSingle();
  if (!lead) return NextResponse.json({ erro: 'Venda não encontrada.' }, { status: 404 });
  if (lead.status !== 'ganho') return NextResponse.json({ enviado: false, motivo: 'A venda ainda não foi fechada.' });
  if (lead.portal_convite_enviado_em && !reenviar) return NextResponse.json({ enviado: false, motivo: 'O cliente já recebeu o acesso.', jaEnviado: true });
  if (!lead.client_id) return NextResponse.json({ enviado: false, motivo: 'A venda não está ligada a um cliente cadastrado.' });

  const { data: cliente } = await db.from('clientes').select('id, nome_empresa, email')
    .eq('id', lead.client_id).eq('empresa_id', perfil.empresa_id).maybeSingle();
  const email = (cliente?.email || '').trim();
  if (!cliente || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ enviado: false, motivo: 'O cliente não tem e-mail cadastrado. Cadastre o e-mail dele em Clientes e clique em "Enviar acesso ao portal".' });
  }

  try {
    await enviarLinkAcesso(db, { empresa, clienteId: cliente.id, nomeCliente: cliente.nome_empresa, email, base: urlBase(req), convite: true });
  } catch (e) {
    console.error('[portal-cliente/convidar]', e);
    // Rota só da equipe (autenticada) — mostra o motivo real (ex: remetente do Resend não
    // verificado), senão não dá pra saber o que corrigir.
    const motivo = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Não foi possível enviar o e-mail: ${motivo}` }, { status: 502 });
  }
  await db.from('leads').update({ portal_convite_enviado_em: new Date().toISOString() }).eq('id', lead.id);
  return NextResponse.json({ enviado: true, email });
}
