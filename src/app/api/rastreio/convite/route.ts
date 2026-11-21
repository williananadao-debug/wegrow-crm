import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { criarConvite, urlBase, CONVITE_DIAS, type AcessoExtra } from '@/lib/rastreioApp';

// Painel → "Acesso ao app": gera o link de uso único para o cliente final.
// Com { extra: { nome, telefone, veiculoIds, podeBloquear } } = acesso de outra pessoa da empresa
// cliente (motorista, gestor), só com os veículos escolhidos.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { clienteId, extra } = await req.json().catch(() => ({}));
  const { data: c } = await db.from('rastreio_clientes').select('id, nome, telefone, status')
    .eq('id', clienteId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  if (c.status === 'cancelado') return NextResponse.json({ error: 'Cliente cancelado não tem acesso ao app.' }, { status: 409 });

  let acesso: AcessoExtra | undefined;
  if (extra) {
    const nome = String(extra.nome || '').trim().slice(0, 60);
    if (!nome) return NextResponse.json({ error: 'Informe o nome de quem vai usar.' }, { status: 400 });
    let veiculoIds: string[] | null = null;
    if (Array.isArray(extra.veiculoIds) && extra.veiculoIds.length) {
      const { data: vs } = await db.from('rastreio_veiculos').select('id').eq('cliente_id', c.id).in('id', extra.veiculoIds.map(String));
      veiculoIds = (vs || []).map(v => v.id as string);
      if (!veiculoIds.length) return NextResponse.json({ error: 'Escolha ao menos um veículo deste cliente.' }, { status: 400 });
    }
    acesso = { nome, veiculoIds, podeBloquear: Boolean(extra.podeBloquear) };
  }
  try {
    const token = await criarConvite(db, { empresaId: u.empresaId, clienteId: c.id, criadoPor: u.id, extra: acesso });
    return NextResponse.json({
      ok: true, link: `${urlBase(req)}/meu-rastreio/entrar?t=${token}`, validadeDias: CONVITE_DIAS,
      telefone: acesso ? String(extra.telefone || '') : c.telefone, nome: acesso?.nome || c.nome,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
