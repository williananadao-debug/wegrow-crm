import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';

// Celulares com acesso ao app de um cliente (titular + acessos extras). Revogar = desloga na hora
// (celular perdido, motorista que saiu da empresa).
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { clienteId, revogar } = await req.json().catch(() => ({}));
  const { data: c } = await db.from('rastreio_clientes').select('id').eq('id', clienteId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });

  if (revogar) {
    const { error } = await db.from('rastreio_app_sessoes').update({ revogado_em: new Date().toISOString() })
      .eq('id', Number(revogar)).eq('cliente_id', c.id).is('revogado_em', null);
    if (error) return NextResponse.json({ error: 'Não foi possível revogar.' }, { status: 500 });
  }

  const [{ data: sessoes }, { data: convites }] = await Promise.all([
    db.from('rastreio_app_sessoes').select('id, nome, veiculo_ids, pode_bloquear, dispositivo, ultimo_acesso, created_at')
      .eq('cliente_id', c.id).is('revogado_em', null).gt('expira_em', new Date().toISOString()).order('ultimo_acesso', { ascending: false }).limit(50),
    db.from('rastreio_app_convites').select('id, nome, expira_em, created_at')
      .eq('cliente_id', c.id).is('usado_em', null).gt('expira_em', new Date().toISOString()).order('created_at', { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ sessoes: sessoes || [], convitesPendentes: convites || [] });
}
