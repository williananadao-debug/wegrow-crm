import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TIPOS_REVERSIVEIS = ['venda', 'consumo_producao', 'producao'];

// POST { leadId, confirmacao: 'EXCLUIR' } — exclui DE VERDADE uma venda (lead) e o que nasceu dela:
// produção (e histórico), lançamentos financeiros ligados (pelo "OS: LD-xxxx" no título), visitas.
// O que a venda/produção baixou do estoque volta. Só diretor, só da própria empresa. Diferente do
// "Estornar" (que mantém tudo e só compensa no financeiro), isso NÃO deixa rastro — pensado pra
// venda de teste/lançamento errado. Recusa se tiver NFS-e emitida ou cobrança ativa no Asaas.
export async function POST(req: NextRequest) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo, nome').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });
  if (perfil.cargo !== 'diretor') return NextResponse.json({ erro: 'Só o diretor pode excluir vendas.' }, { status: 403 });

  let body: { leadId?: number; confirmacao?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const leadId = Number(body.leadId);
  if (!leadId || body.confirmacao !== 'EXCLUIR') return NextResponse.json({ erro: 'Confirmação obrigatória (digite EXCLUIR).' }, { status: 422 });

  const { data: lead } = await db.from('leads').select('id, empresa, empresa_id, nfse_invoice_id, cobrancas_manuais').eq('id', leadId).single();
  if (!lead || lead.empresa_id !== perfil.empresa_id) return NextResponse.json({ erro: 'Venda não encontrada.' }, { status: 404 });
  if (lead.nfse_invoice_id) return NextResponse.json({ erro: 'Essa venda tem nota fiscal de serviço emitida — não pode ser excluída (cancele a nota antes).' }, { status: 409 });
  const cobrancasAtivas = (Array.isArray(lead.cobrancas_manuais) ? lead.cobrancas_manuais : []).filter((c: any) => !c.cancelada);
  if (cobrancasAtivas.length > 0) return NextResponse.json({ erro: `Essa venda tem ${cobrancasAtivas.length} cobrança(s) ativa(s) no Asaas — cancele pelo CRM antes de excluir.` }, { status: 409 });

  try {
    const { data: prods } = await db.from('pulse_producoes').select('id').eq('lead_id', leadId);
    const prodIds = (prods || []).map(p => p.id);

    // 1) devolve ao estoque o que a venda/produção baixou, e apaga esses movimentos
    const { data: movs } = await db.from('estoque_movimentacoes').select('id, servico_id, quantidade, tipo, lead_id, producao_id')
      .eq('empresa_id', perfil.empresa_id).in('tipo', TIPOS_REVERSIVEIS);
    const daVenda = (movs || []).filter(m => m.lead_id === leadId || (m.producao_id != null && prodIds.includes(m.producao_id)));
    const soma = new Map<number, number>();
    daVenda.forEach(m => soma.set(m.servico_id, (soma.get(m.servico_id) || 0) + Number(m.quantidade)));
    for (const [servicoId, total] of soma) {
      const { data: s } = await db.from('servicos').select('estoque').eq('id', servicoId).single();
      if (s && s.estoque !== null && s.estoque !== undefined) await db.from('servicos').update({ estoque: Number(s.estoque) - total }).eq('id', servicoId);
    }
    if (daVenda.length > 0) await db.from('estoque_movimentacoes').delete().in('id', daVenda.map(m => m.id));

    // 2) produção (eventos/itens caem por CASCADE)
    if (prodIds.length > 0) {
      const { error } = await db.from('pulse_producoes').delete().in('id', prodIds);
      if (error) throw new Error(`produção: ${error.message}`);
    }

    // 3) financeiro ligado pelo texto do título ("... OS: LD-0042") — não há FK
    const codigo = `LD-${String(leadId).padStart(4, '0')}`;
    const { data: lancs } = await db.from('lancamentos').delete().eq('empresa_id', perfil.empresa_id).ilike('titulo', `%OS: ${codigo}%`).select('id');

    // 4) visitas e a venda
    await db.from('visitas').delete().eq('lead_id', leadId);
    const { error: errLead } = await db.from('leads').delete().eq('id', leadId);
    if (errLead) throw new Error(`venda: ${errLead.message}`);

    console.warn(`[excluir-venda] ${perfil.nome} (${user.id}) excluiu ${codigo} — ${lead.empresa}`);
    return NextResponse.json({ ok: true, producoes: prodIds.length, lancamentos: lancs?.length || 0, movimentacoesRevertidas: daVenda.length });
  } catch (e: any) {
    console.error('[excluir-venda]', e);
    return NextResponse.json({ erro: e?.message || 'Erro ao excluir a venda.' }, { status: 500 });
  }
}
