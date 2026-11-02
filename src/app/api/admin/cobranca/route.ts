import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { asaasWegrow } from '@/lib/nfWegrow';
import { cancelarAssinatura, carregarConfigCobranca, salvarAssinatura, sincronizarAssinatura, hojeBR, STATUS_PAGOS } from '@/lib/cobrancaWegrow';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

// GET ?empresa_id=  → pagamentos da assinatura daquele cliente
// GET (sem empresa) → visão geral da cobrança: regras da régua, totais do mês e pagamentos recentes
export async function GET(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  const db = supabaseAdmin();
  const empresaId = new URL(request.url).searchParams.get('empresa_id');

  if (empresaId) {
    const { data: pagamentos } = await db.from('wegrow_pagamentos').select('*').eq('empresa_id', empresaId).order('vencimento', { ascending: false }).limit(24);
    return NextResponse.json({ pagamentos: pagamentos || [] });
  }

  const desde = new Date(Date.parse(hojeBR()) - 120 * 86400_000).toISOString().substring(0, 10);
  const [config, { data: pagamentos }, { data: empresas }, { data: parceiros }, { data: assinaturas }] = await Promise.all([
    carregarConfigCobranca(db),
    db.from('wegrow_pagamentos').select('*').gte('vencimento', desde).order('vencimento', { ascending: false }).limit(500),
    db.from('empresas').select('id, nome, logo_url, bloqueio_cobranca_em'),
    db.from('parceiros').select('id, nome'),
    db.from('clientes_wegrow').select('empresa_id, assinatura_status, valor_mensal, em_atraso_desde'),
  ]);
  const emp = new Map((empresas || []).map(e => [e.id, e]));
  const par = new Map((parceiros || []).map(p => [p.id, p.nome]));
  return NextResponse.json({
    config,
    pagamentos: (pagamentos || []).map(p => ({ ...p, empresa_nome: emp.get(p.empresa_id)?.nome || '—', empresa_logo: emp.get(p.empresa_id)?.logo_url || null, parceiro_nome: p.parceiro_id ? par.get(p.parceiro_id) || null : null })),
    assinaturas_ativas: (assinaturas || []).filter(a => a.assinatura_status === 'ativa').length,
    mrr_assinaturas: (assinaturas || []).filter(a => a.assinatura_status === 'ativa').reduce((s, a) => s + Number(a.valor_mensal || 0), 0),
    suspensas: (empresas || []).filter(e => e.bloqueio_cobranca_em).map(e => ({ id: e.id, nome: e.nome, desde: e.bloqueio_cobranca_em })),
    statusPagos: STATUS_PAGOS,
  });
}

// POST { acao: 'assinatura', empresa_id, forma?, proximo_vencimento? } → cria/atualiza a assinatura mensal
//      { acao: 'cancelar_assinatura' | 'sincronizar', empresa_id }
//      { acao: 'liberar_acesso', empresa_id }                      → tira a suspensão na mão
//      { acao: 'salvar_config', ...regras }                         → régua de cobrança
//      { empresa_id, tipo: 'BOLETO' | 'PIX' } (sem acao)            → cobrança avulsa (legado)
export async function POST(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const db = supabaseAdmin();
  const { acao, empresa_id } = body;

  if (acao === 'salvar_config') {
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const c of ['regua_ativa', 'suspensao_automatica']) if (c in body) patch[c] = !!body[c];
    for (const c of ['dias_lembrete', 'dias_suspensao', 'multa_pct', 'juros_mes_pct']) if (c in body) patch[c] = Math.max(0, Number(body[c]) || 0);
    if ('dias_suspensao' in patch && patch.dias_suspensao < 5) return NextResponse.json({ erro: 'A suspensão precisa de pelo menos 5 dias de atraso.' }, { status: 422 });
    const { error } = await db.from('wegrow_cobranca_config').update(patch).eq('id', 1);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!empresa_id) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 422 });
  if (!process.env.ASAAS_API_KEY && acao !== 'liberar_acesso') return NextResponse.json({ erro: 'ASAAS_API_KEY não configurada no servidor.' }, { status: 500 });

  try {
    if (acao === 'assinatura') {
      const forma = ['BOLETO', 'PIX', 'CREDIT_CARD', 'UNDEFINED'].includes(body.forma) ? body.forma : undefined;
      const r = await salvarAssinatura(db, empresa_id, { forma, proximoVencimento: body.proximo_vencimento || null });
      return NextResponse.json({ ok: true, assinatura_id: r.assinatura.id, pagamentos: r.pagamentos, split: r.splitParceiro });
    }
    if (acao === 'cancelar_assinatura') {
      await cancelarAssinatura(db, empresa_id);
      return NextResponse.json({ ok: true });
    }
    if (acao === 'sincronizar') {
      const pagamentos = await sincronizarAssinatura(db, empresa_id);
      return NextResponse.json({ ok: true, pagamentos });
    }
    if (acao === 'liberar_acesso') {
      await db.from('empresas').update({ bloqueio_cobranca_em: null }).eq('id', empresa_id);
      return NextResponse.json({ ok: true });
    }
  } catch (err: any) {
    console.error(`[admin/cobranca] ${acao}`, err);
    return NextResponse.json({ erro: 'Asaas: ' + err.message }, { status: 502 });
  }

  // Cobrança avulsa (boleto/Pix de um mês só) — continua pra quem não tem assinatura
  const { tipo } = body as { tipo?: 'BOLETO' | 'PIX' };
  if (!tipo || !['BOLETO', 'PIX'].includes(tipo)) return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });

  const { data: empresa } = await db.from('empresas').select('nome').eq('id', empresa_id).single();
  const { data: billing } = await db.from('clientes_wegrow').select('*').eq('empresa_id', empresa_id).maybeSingle();
  const razaoSocial = billing?.razao_social || empresa?.nome;
  const cnpj = (billing?.cnpj || '').replace(/\D/g, '');
  const valor = billing?.valor_mensal;
  const vencimento = billing?.proximo_vencimento || new Date().toISOString().substring(0, 10);

  if (!razaoSocial || !cnpj) return NextResponse.json({ erro: 'Falta razão social ou CNPJ — preenche na aba Documentos (gera o contrato) ou Faturamento antes.' }, { status: 422 });
  if (!valor) return NextResponse.json({ erro: 'Falta o valor mensal — preenche na aba Faturamento.' }, { status: 422 });

  try {
    let customerId = billing?.asaas_customer_id as string | undefined;
    if (!customerId) {
      const busca = await asaasWegrow('GET', `/customers?cpfCnpj=${cnpj}`);
      customerId = busca.data?.[0]?.id || (await asaasWegrow('POST', '/customers', { name: razaoSocial, cpfCnpj: cnpj, email: billing?.email_financeiro || undefined })).id;
    }

    const payment = await asaasWegrow('POST', '/payments', {
      customer: customerId,
      billingType: tipo,
      value: Number(valor),
      dueDate: vencimento,
      description: `Assinatura WeGrow — ${razaoSocial}`,
      externalReference: empresa_id,
    });
    const linkCobranca = payment.invoiceUrl || payment.bankSlipUrl || null;

    await db.from('clientes_wegrow').upsert({
      empresa_id,
      asaas_customer_id: customerId,
      ultima_cobranca_id: payment.id,
      ultima_cobranca_tipo: tipo,
      ultima_cobranca_url: linkCobranca,
      ultima_cobranca_status: payment.status,
      ultima_cobranca_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id' });

    return NextResponse.json({ ok: true, url: linkCobranca, id: payment.id, status: payment.status });
  } catch (err: any) {
    console.error('[admin/cobranca]', err);
    return NextResponse.json({ erro: 'Erro ao gerar cobrança no Asaas: ' + err.message }, { status: 502 });
  }
}
