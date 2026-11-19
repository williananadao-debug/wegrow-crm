import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { cancelarAssinatura } from '@/lib/rastreioCobranca';

// Exclui o cliente do rastreio de vez (convites, sessões do app, cobranças espelhadas e
// motoristas dele vão junto pelo ON DELETE CASCADE). Só diretor/gerente. Bloqueia se ainda
// houver veículo ATIVO no nome dele — veículos inativos ficam sem dono (histórico preservado).
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  if (u.cargo !== 'diretor' && u.cargo !== 'gerente') return NextResponse.json({ error: 'Só diretor ou gerente pode excluir clientes.' }, { status: 403 });

  const { clienteId } = await req.json().catch(() => ({}));
  const { data: c } = await db.from('rastreio_clientes').select('id, nome, asaas_assinatura_id, assinatura_status')
    .eq('id', clienteId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });

  const { count } = await db.from('rastreio_veiculos').select('id', { count: 'exact', head: true }).eq('cliente_id', c.id).eq('status', 'ativo');
  if (count) return NextResponse.json({ error: `${c.nome} ainda tem ${count} veículo(s) ativo(s). Desative ou exclua os veículos antes.` }, { status: 409 });

  // Cobrança automática no Asaas: cancela antes, para o cliente não continuar recebendo boleto.
  if (c.asaas_assinatura_id && c.assinatura_status === 'ativa') {
    try { await cancelarAssinatura(db, u.empresaId, c.id); }
    catch (e) { return NextResponse.json({ error: `Não consegui cancelar a cobrança no Asaas: ${(e as Error).message}` }, { status: 502 }); }
  }

  const { error } = await db.from('rastreio_clientes').delete().eq('id', c.id);
  if (error) return NextResponse.json({ error: `Não foi possível excluir: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, mensagem: `${c.nome} excluído.` });
}
