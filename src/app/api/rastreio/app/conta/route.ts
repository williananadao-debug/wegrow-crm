import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp } from '@/lib/rastreioApp';
import { linkArquivoContrato } from '@/lib/rastreioContrato';

export const dynamic = 'force-dynamic';

// App do cliente → "Minha conta": faturas (2ª via, pagar com cartão/Pix/boleto, NF) e contrato.
// Só o titular vê; acessos extras (motorista, funcionário) não enxergam o financeiro.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  if (s.nome) return NextResponse.json({ error: 'Só o titular da conta vê o financeiro.' }, { status: 403 });

  const [{ data: cli }, { data: cobrancas }, { data: contratos }] = await Promise.all([
    db.from('rastreio_clientes').select('nome, mensalidade, dia_vencimento, forma_pagamento, assinatura_status').eq('id', s.clienteId).maybeSingle(),
    db.from('rastreio_cobrancas').select('id, descricao, valor, vencimento, pago_em, status, forma, invoice_url, nf_url, asaas_assinatura_id')
      .eq('cliente_id', s.clienteId).neq('status', 'DELETED').order('vencimento', { ascending: false }).limit(24),
    db.from('rastreio_contratos').select('id, status, link_cliente, created_at, assinado_em, arquivos')
      .eq('cliente_id', s.clienteId).neq('status', 'cancelado').order('created_at', { ascending: false }).limit(1),
  ]);

  const ct = contratos?.[0] as { id: number; status: string; link_cliente: string | null; created_at: string; assinado_em: string | null; arquivos: { nome: string; path: string }[] | null } | undefined;
  let contrato: { status: string; assinarUrl: string | null; pdfUrl: string | null; data: string } | null = null;
  if (ct) {
    const arq = ct.arquivos?.find(a => a.nome === 'contrato_assinado.pdf');
    contrato = {
      status: ct.status,
      assinarUrl: ct.status === 'enviado' ? ct.link_cliente : null,
      pdfUrl: ct.status === 'assinado' && arq ? await linkArquivoContrato(db, arq.path) : null,
      data: ct.assinado_em || ct.created_at,
    };
  }
  return NextResponse.json({
    plano: cli ? { mensalidade: Number(cli.mensalidade || 0), dia: cli.dia_vencimento || 10, forma: cli.forma_pagamento, automatica: cli.assinatura_status === 'ativa' } : null,
    cobrancas: (cobrancas || []).map(c => ({ ...c, tipo: c.asaas_assinatura_id ? 'Mensalidade' : (c.descricao || 'Cobrança') })),
    contrato,
  });
}
