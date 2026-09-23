import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// POST { notaId, confirmacao: 'EXCLUIR' } — apaga uma nota fiscal lançada errada (entrada ou
// saída) e desfaz tudo que ela gerou: devolve/retira do estoque conforme o sinal da
// movimentação, apaga as movimentações de estoque ligadas, os itens da nota e o lançamento
// financeiro (conta a pagar) criado junto — se ele já estiver pago, recusa e pede pra
// estornar no Financeiro antes. Só diretor/gerente, só da própria empresa.
export async function POST(req: NextRequest) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo, nome').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });
  if (!['diretor', 'gerente'].includes(perfil.cargo)) return NextResponse.json({ erro: 'Só diretor ou gerente pode excluir nota fiscal.' }, { status: 403 });

  let body: { notaId?: number; confirmacao?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const notaId = Number(body.notaId);
  if (!notaId || body.confirmacao !== 'EXCLUIR') return NextResponse.json({ erro: 'Confirmação obrigatória (digite EXCLUIR).' }, { status: 422 });

  const { data: nota } = await db.from('fiscal_notas').select('id, empresa_id, tipo, numero, nome_participante, lancamento_id').eq('id', notaId).single();
  if (!nota || nota.empresa_id !== perfil.empresa_id) return NextResponse.json({ erro: 'Nota não encontrada.' }, { status: 404 });

  if (nota.lancamento_id) {
    const { data: lanc } = await db.from('lancamentos').select('id, status').eq('id', nota.lancamento_id).single();
    if (lanc?.status === 'pago') {
      return NextResponse.json({ erro: 'Essa nota já tem um lançamento marcado como pago no Financeiro — estorne o pagamento lá antes de excluir a nota.' }, { status: 409 });
    }
  }

  try {
    // 1) movimentações de estoque ligadas a esta nota (por fiscal_notas_itens ou pelo link direto
    // da nota), desfazendo o efeito no estoque de cada uma antes de apagar
    const { data: itens } = await db.from('fiscal_notas_itens').select('id, servico_id, estoque_movimentacao_id').eq('nota_id', notaId);
    const movIds = new Set<number>((itens || []).map(i => i.estoque_movimentacao_id).filter((x): x is number => x != null));
    const { data: notaDireta } = await db.from('fiscal_notas').select('estoque_movimentacao_id').eq('id', notaId).single();
    if (notaDireta?.estoque_movimentacao_id) movIds.add(notaDireta.estoque_movimentacao_id);

    if (movIds.size > 0) {
      const { data: movs } = await db.from('estoque_movimentacoes').select('id, servico_id, quantidade').in('id', [...movIds]);
      for (const m of movs || []) {
        const { data: s } = await db.from('servicos').select('estoque').eq('id', m.servico_id).single();
        if (s && s.estoque !== null && s.estoque !== undefined) {
          await db.from('servicos').update({ estoque: Number(s.estoque) - Number(m.quantidade) }).eq('id', m.servico_id);
        }
      }
      await db.from('estoque_movimentacoes').delete().in('id', [...movIds]);
    }

    // 2) itens da nota
    await db.from('fiscal_notas_itens').delete().eq('nota_id', notaId);

    // 3) lançamento financeiro criado junto (pendente/cancelado — pago já foi barrado acima)
    if (nota.lancamento_id) await db.from('lancamentos').delete().eq('id', nota.lancamento_id);

    // 4) a nota em si
    const { error: errNota } = await db.from('fiscal_notas').delete().eq('id', notaId);
    if (errNota) throw new Error(errNota.message);

    console.warn(`[excluir-nota] ${perfil.nome} (${user.id}) excluiu nota #${notaId} (${nota.tipo}, NF ${nota.numero || '?'}, ${nota.nome_participante || '?'})`);
    return NextResponse.json({ ok: true, movimentacoesRevertidas: movIds.size });
  } catch (e: any) {
    console.error('[excluir-nota]', e);
    return NextResponse.json({ erro: e?.message || 'Erro ao excluir a nota.' }, { status: 500 });
  }
}
