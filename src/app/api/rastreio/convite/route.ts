import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { criarConvite, urlBase, CONVITE_DIAS } from '@/lib/rastreioApp';

// Painel → "Enviar acesso ao app": gera o link de uso único para o cliente final.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { clienteId } = await req.json().catch(() => ({}));
  const { data: c } = await db.from('rastreio_clientes').select('id, nome, telefone, status')
    .eq('id', clienteId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  if (c.status === 'cancelado') return NextResponse.json({ error: 'Cliente cancelado não tem acesso ao app.' }, { status: 409 });
  const token = await criarConvite(db, { empresaId: u.empresaId, clienteId: c.id, criadoPor: u.id });
  return NextResponse.json({ ok: true, link: `${urlBase(req)}/meu-rastreio/entrar?t=${token}`, validadeDias: CONVITE_DIAS, telefone: c.telefone, nome: c.nome });
}
