import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { confereSenha, gerarSenha, hashSenha, loginDoCliente, urlBase } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

// Painel → "Acesso ao app" → login e senha permanentes do titular.
//   { clienteId, acao: 'gerar' }          gera senha nova (a antiga deixa de valer) e devolve login + senha
//   { clienteId, acao: 'email', senha }   manda login + senha por e-mail para o cliente (confere a senha antes)
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { clienteId, acao, senha } = await req.json().catch(() => ({}));
  const { data: c } = await db.from('rastreio_clientes').select('id, nome, documento, telefone, email, status, app_senha_hash')
    .eq('id', clienteId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  if (c.status === 'cancelado') return NextResponse.json({ error: 'Cliente cancelado não tem acesso ao app.' }, { status: 409 });
  const login = loginDoCliente(c);
  if (!login) return NextResponse.json({ error: 'Cadastre o CPF/CNPJ ou o celular do cliente: é o login dele no app.' }, { status: 422 });
  const link = `${urlBase(req)}/meu-rastreio`;

  if (acao === 'gerar') {
    const nova = gerarSenha();
    const { error } = await db.from('rastreio_clientes')
      .update({ app_login: login, app_senha_hash: hashSenha(nova), app_senha_erros: 0, app_senha_bloqueio_ate: null }).eq('id', c.id);
    if (error) return NextResponse.json({ error: 'Não foi possível salvar a senha agora.' }, { status: 500 });
    return NextResponse.json({ ok: true, login, senha: nova, link, email: c.email || null, telefone: c.telefone || null, nome: c.nome });
  }

  if (acao === 'email') {
    if (!c.email) return NextResponse.json({ error: 'Cliente sem e-mail cadastrado.' }, { status: 422 });
    if (!confereSenha(String(senha || ''), c.app_senha_hash)) return NextResponse.json({ error: 'Gere a senha de novo e envie em seguida.' }, { status: 409 });
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Envio de e-mail não configurado.' }, { status: 503 });
    const { data: emp } = await db.from('empresas').select('nome').eq('id', u.empresaId).maybeSingle();
    const { Resend } = await import('resend');
    const r = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
      to: c.email,
      subject: `Seu acesso ao app de rastreamento${emp?.nome ? ` — ${emp.nome}` : ''}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">
        <p>Olá, ${esc(String(c.nome).split(' ')[0])}!</p>
        <p>Este é o seu acesso ao app de rastreamento do seu veículo:</p>
        <p style="background:#f1f5f9;border-radius:8px;padding:12px 14px;line-height:1.8">
          <b>Endereço:</b> <a href="${link}">${link}</a><br>
          <b>Login:</b> ${esc(login)}<br>
          <b>Senha:</b> <span style="font-family:monospace;font-size:17px">${esc(senha)}</span></p>
        <p>No celular, depois de entrar, toque em <b>Compartilhar → Adicionar à Tela de Início</b> (iPhone) ou <b>⋮ → Instalar app</b> (Android) para ter o ícone.</p>
        <p style="color:#64748b;font-size:12px">Guarde esta senha. Se esquecer, peça uma nova para a sua central de rastreamento${emp?.nome ? ` (${esc(emp.nome)})` : ''}.</p></div>`,
    }).catch((e: Error) => ({ error: e }));
    if ((r as { error?: unknown }).error) return NextResponse.json({ error: 'O e-mail não saiu. Tente de novo ou mande pelo WhatsApp.' }, { status: 502 });
    return NextResponse.json({ ok: true, email: c.email });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
