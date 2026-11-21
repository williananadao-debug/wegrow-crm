import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { enviarRelatorioCliente } from '@/lib/rastreioRelatorioEmail';

// Painel → "Enviar agora" no cadastro do cliente (teste do relatório por e-mail).
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { clienteId, frequencia } = await req.json().catch(() => ({}));
  const { data: c } = await db.from('rastreio_clientes').select('id, email').eq('id', clienteId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  if (!c.email) return NextResponse.json({ error: 'Cadastre o e-mail do cliente primeiro.' }, { status: 400 });
  const erro = await enviarRelatorioCliente(db, c.id, frequencia === 'mensal' ? 'mensal' : 'semanal');
  return erro ? NextResponse.json({ error: erro }, { status: 502 }) : NextResponse.json({ ok: true, email: c.email });
}
