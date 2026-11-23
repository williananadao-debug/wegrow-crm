// Cobrança das mensalidades do Rastreio (cliente final → instalador).
// O dinheiro cai na conta Asaas do INSTALADOR (financeiro_integracoes da empresa). A WeGrow
// recebe a taxa da plataforma no split: % de cada mensalidade paga (rastreio_cobranca_config.
// taxa_wegrow_pct) para a carteira WEGROW_ASAAS_WALLET_ID. Sem carteira ou com 0%, sem split.
//
//  conectarAsaas()       valida a chave, salva e cadastra o webhook na conta do instalador
//  salvarAssinatura()    cria/atualiza a assinatura mensal do cliente (boleto/Pix/cartão)
//  registrarPagamento()  espelha um pagamento (webhook/sincronização) e aplica atraso/suspensão
//  sincronizarEmpresa()  rede de segurança diária do webhook
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { asaas } from '@/lib/asaas';

export const STATUS_PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
export const STATUS_ABERTOS = ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'];
export type Forma = 'UNDEFINED' | 'BOLETO' | 'PIX' | 'CREDIT_CARD';
const FORMAS: Forma[] = ['UNDEFINED', 'BOLETO', 'PIX', 'CREDIT_CARD'];

export type ConfigCobranca = {
  taxa_wegrow_pct: number; dias_suspensao: number; multa_pct: number; juros_mes_pct: number;
  nfse_automatica: boolean; nfse_servico_codigo: string | null; nfse_servico_descricao: string | null; webhook_token: string | null;
  // dados do instalador e condições que entram no contrato (lib/rastreioContrato)
  emp_razao: string | null; emp_documento: string | null; emp_endereco: string | null; emp_cidade: string | null; emp_uf: string | null;
  emp_telefone: string | null; emp_email: string | null;
  contrato_fidelidade_meses: number; contrato_valor_equipamento: number; contrato_taxa_instalacao: number; contrato_texto_extra: string | null;
};
const PADRAO: ConfigCobranca = {
  taxa_wegrow_pct: 0, dias_suspensao: 10, multa_pct: 2, juros_mes_pct: 1,
  nfse_automatica: false, nfse_servico_codigo: null, nfse_servico_descricao: 'Serviço de monitoramento e rastreamento veicular', webhook_token: null,
  emp_razao: null, emp_documento: null, emp_endereco: null, emp_cidade: null, emp_uf: null, emp_telefone: null, emp_email: null,
  contrato_fidelidade_meses: 12, contrato_valor_equipamento: 0, contrato_taxa_instalacao: 0, contrato_texto_extra: null,
};

export async function carregarConfig(db: SupabaseClient, empresaId: string): Promise<ConfigCobranca> {
  const { data } = await db.from('rastreio_cobranca_config').select('*').eq('empresa_id', empresaId).maybeSingle();
  const c = { ...PADRAO, ...(data || {}) };
  return {
    ...c, taxa_wegrow_pct: Number(c.taxa_wegrow_pct) || 0, multa_pct: Number(c.multa_pct) || 0, juros_mes_pct: Number(c.juros_mes_pct) || 0, dias_suspensao: Number(c.dias_suspensao),
    contrato_fidelidade_meses: Number(c.contrato_fidelidade_meses) || 0, contrato_valor_equipamento: Number(c.contrato_valor_equipamento) || 0,
    contrato_taxa_instalacao: Number(c.contrato_taxa_instalacao) || 0,
  };
}

export async function integracaoAsaas(db: SupabaseClient, empresaId: string) {
  const { data } = await db.from('financeiro_integracoes').select('asaas_api_key, ambiente').eq('empresa_id', empresaId).maybeSingle();
  return data?.asaas_api_key ? { key: data.asaas_api_key as string, amb: (data.ambiente as string) || 'producao' } : null;
}

export function hojeBR() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().substring(0, 10);
}
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400_000);

/** Próxima data com o dia de vencimento do cliente, a partir de amanhã. */
export function proximoVencimento(dia: number | null) {
  const d = Math.min(Math.max(Number(dia) || 10, 1), 28);
  const hoje = hojeBR();
  const [a, m] = hoje.split('-').map(Number);
  let alvo = new Date(Date.UTC(a, m - 1, d)).toISOString().substring(0, 10);
  if (alvo <= hoje) alvo = new Date(Date.UTC(a, m, d)).toISOString().substring(0, 10);
  return alvo;
}

function urlApp() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br').replace(/\/$/, '');
}

/** Valida a chave, grava a integração da empresa e cadastra o webhook do Rastreio na conta dela. */
export async function conectarAsaas(db: SupabaseClient, empresaId: string, apiKey: string, ambiente: 'producao' | 'sandbox') {
  const conta = await asaas(apiKey, ambiente, 'GET', '/myAccount').catch((e: Error) => { throw new Error(`Chave recusada pelo Asaas: ${e.message}`); });
  await db.from('financeiro_integracoes').upsert({ empresa_id: empresaId, asaas_api_key: apiKey, ambiente, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id' });

  const cfg = await carregarConfig(db, empresaId);
  const token = cfg.webhook_token || randomBytes(24).toString('hex');
  await db.from('rastreio_cobranca_config').upsert({ empresa_id: empresaId, webhook_token: token, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id' });

  let webhook = 'ok';
  try {
    const url = `${urlApp()}/api/rastreio/asaas-webhook?e=${empresaId}`;
    const lista = await asaas(apiKey, ambiente, 'GET', '/webhooks').catch(() => ({ data: [] }));
    const existente = (lista.data || []).find((w: { url?: string }) => w.url === url);
    const corpo = {
      name: 'WeGrow Rastreio', url, email: conta.email, enabled: true, interrupted: false, apiVersion: 3, authToken: token, sendType: 'SEQUENTIALLY',
      events: ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_RESTORED'],
    };
    if (existente?.id) await asaas(apiKey, ambiente, 'PUT', `/webhooks/${existente.id}`, corpo);
    else await asaas(apiKey, ambiente, 'POST', '/webhooks', corpo);
  } catch (e) {
    webhook = `não cadastrado (${(e as Error).message}) — a sincronização diária cobre`;
  }
  return { nome: conta.name || conta.companyName || '', email: conta.email || '', webhook };
}

type Cliente = {
  id: string; empresa_id: string; tipo: string; nome: string; documento: string | null; email: string | null; telefone: string | null;
  endereco: string | null; mensalidade: number; dia_vencimento: number | null; status: string;
  asaas_customer_id: string | null; asaas_assinatura_id: string | null; assinatura_status: string | null; forma_pagamento: string;
};

async function garantirClienteAsaas(db: SupabaseClient, ig: { key: string; amb: string }, c: Cliente) {
  if (c.asaas_customer_id) return c.asaas_customer_id;
  const doc = String(c.documento || '').replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) throw new Error(`Cadastre o CPF/CNPJ de ${c.nome} antes de criar a cobrança.`);
  const busca = await asaas(ig.key, ig.amb, 'GET', `/customers?cpfCnpj=${doc}`);
  let id = busca.data?.[0]?.id as string | undefined;
  if (!id) {
    const fone = String(c.telefone || '').replace(/\D/g, '');
    id = (await asaas(ig.key, ig.amb, 'POST', '/customers', {
      name: c.nome, cpfCnpj: doc, ...(c.email ? { email: c.email } : {}), ...(fone ? { mobilePhone: fone } : {}),
      externalReference: `rastreio:${c.id}`, notificationDisabled: false,
    })).id as string;
  }
  await db.from('rastreio_clientes').update({ asaas_customer_id: id }).eq('id', c.id);
  return id;
}

function montarSplit(cfg: ConfigCobranca) {
  const wallet = process.env.WEGROW_ASAAS_WALLET_ID;
  if (!wallet || !(cfg.taxa_wegrow_pct > 0)) return [];
  return [{ walletId: wallet, percentualValue: cfg.taxa_wegrow_pct }];
}

/** Cria ou atualiza a assinatura mensal do cliente no Asaas do instalador. */
export async function salvarAssinatura(db: SupabaseClient, empresaId: string, clienteId: string, p: { forma?: string }) {
  const ig = await integracaoAsaas(db, empresaId);
  if (!ig) throw new Error('Conecte a conta Asaas da empresa primeiro (Financeiro do rastreio → Conectar Asaas).');
  const { data: c } = await db.from('rastreio_clientes').select('*').eq('id', clienteId).eq('empresa_id', empresaId).maybeSingle();
  if (!c) throw new Error('Cliente não encontrado.');
  const cli = c as Cliente;
  const valor = Number(cli.mensalidade || 0);
  if (!(valor >= 5)) throw new Error('Informe a mensalidade do cliente (mínimo R$ 5,00).');
  if (cli.status === 'cancelado') throw new Error('Cliente cancelado.');
  const forma: Forma = FORMAS.includes(p.forma as Forma) ? (p.forma as Forma) : ((cli.forma_pagamento as Forma) || 'UNDEFINED');
  const cfg = await carregarConfig(db, empresaId);
  const customer = await garantirClienteAsaas(db, ig, cli);

  const { data: veics } = await db.from('rastreio_veiculos').select('placa').eq('cliente_id', cli.id).eq('status', 'ativo').order('placa');
  const placas = (veics || []).map(v => v.placa).join(', ');
  const corpo = {
    billingType: forma, value: valor,
    description: `Monitoramento veicular${placas ? ` — ${placas}` : ''}`,
    externalReference: `rastreio:${cli.id}`,
    fine: { value: cfg.multa_pct }, interest: { value: cfg.juros_mes_pct },
    split: montarSplit(cfg),
  };

  let assinatura: { id: string };
  if (cli.asaas_assinatura_id && cli.assinatura_status === 'ativa') {
    assinatura = await asaas(ig.key, ig.amb, 'PUT', `/subscriptions/${cli.asaas_assinatura_id}`, { ...corpo, updatePendingPayments: true });
  } else {
    assinatura = await asaas(ig.key, ig.amb, 'POST', '/subscriptions', {
      ...corpo, customer, cycle: 'MONTHLY', nextDueDate: proximoVencimento(cli.dia_vencimento),
    });
  }
  await db.from('rastreio_clientes').update({ asaas_assinatura_id: assinatura.id, assinatura_status: 'ativa', forma_pagamento: forma }).eq('id', cli.id);

  let nf = '';
  if (cfg.nfse_automatica) {
    nf = await configurarNfse(ig, assinatura.id, cfg).then(() => 'NF automática ligada').catch((e: Error) => `NF não configurada: ${e.message}`);
  }
  await sincronizarCliente(db, empresaId, cli.id).catch(() => null);
  return { assinaturaId: assinatura.id, nf };
}

async function configurarNfse(ig: { key: string; amb: string }, assinaturaId: string, cfg: ConfigCobranca) {
  if (!cfg.nfse_servico_codigo) throw new Error('falta o código do serviço municipal');
  await asaas(ig.key, ig.amb, 'POST', `/subscriptions/${assinaturaId}/invoiceSettings`, {
    municipalServiceCode: cfg.nfse_servico_codigo,
    municipalServiceName: cfg.nfse_servico_descricao || PADRAO.nfse_servico_descricao,
    effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION', receivedOnly: true, deductions: 0,
    observations: 'Mensalidade de monitoramento veicular.',
    taxes: { retainIss: false, iss: 0, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 },
  });
}

export async function cancelarAssinatura(db: SupabaseClient, empresaId: string, clienteId: string) {
  const ig = await integracaoAsaas(db, empresaId);
  const { data: c } = await db.from('rastreio_clientes').select('asaas_assinatura_id').eq('id', clienteId).eq('empresa_id', empresaId).maybeSingle();
  if (!ig || !c?.asaas_assinatura_id) throw new Error('Esse cliente não tem assinatura.');
  await asaas(ig.key, ig.amb, 'DELETE', `/subscriptions/${c.asaas_assinatura_id}`);
  await db.from('rastreio_clientes').update({ assinatura_status: 'cancelada' }).eq('id', clienteId);
}

type PagamentoAsaas = {
  id: string; subscription?: string; externalReference?: string; description?: string; value?: number; netValue?: number;
  dueDate?: string; paymentDate?: string; clientPaymentDate?: string; confirmedDate?: string; status?: string; deleted?: boolean;
  billingType?: string; invoiceUrl?: string; bankSlipUrl?: string;
  split?: { totalValue?: number; fixedValue?: number; percentualValue?: number; walletId?: string }[];
};

/** Espelha um pagamento do Asaas (só os do Rastreio: externalReference "rastreio:<cliente>"). */
export async function registrarPagamento(db: SupabaseClient, empresaId: string, pg: PagamentoAsaas, ig?: { key: string; amb: string } | null) {
  const ref = String(pg.externalReference || '');
  if (!ref.startsWith('rastreio:')) return null;
  const clienteId = ref.slice('rastreio:'.length);
  const { data: cli } = await db.from('rastreio_clientes').select('id').eq('id', clienteId).eq('empresa_id', empresaId).maybeSingle();
  if (!cli) return null;

  const s = Array.isArray(pg.split) ? pg.split.find(x => x.walletId === process.env.WEGROW_ASAAS_WALLET_ID) || null : null;
  const taxa = s ? (s.totalValue ?? s.fixedValue ?? (s.percentualValue && pg.netValue ? Math.round(pg.netValue * s.percentualValue) / 100 : null)) : null;
  const pago = pg.clientPaymentDate || pg.paymentDate || pg.confirmedDate || null;
  const status = pg.deleted ? 'DELETED' : String(pg.status || 'PENDING');

  let nfUrl: string | null = null;
  if (ig && STATUS_PAGOS.includes(status)) {
    const { data: atual } = await db.from('rastreio_cobrancas').select('nf_url').eq('asaas_payment_id', pg.id).maybeSingle();
    nfUrl = atual?.nf_url || null;
    if (!nfUrl) {
      const inv = await asaas(ig.key, ig.amb, 'GET', `/invoices?payment=${pg.id}`).catch(() => null);
      const nota = inv?.data?.find((n: { status?: string }) => n.status === 'AUTHORIZED');
      nfUrl = nota?.pdfUrl || null;
    }
  }

  await db.from('rastreio_cobrancas').upsert({
    empresa_id: empresaId, cliente_id: clienteId, asaas_payment_id: pg.id, asaas_assinatura_id: pg.subscription || null,
    descricao: pg.description || null, valor: Number(pg.value) || 0, valor_liquido: pg.netValue != null ? Number(pg.netValue) : null,
    taxa_wegrow: taxa, vencimento: pg.dueDate || null, pago_em: pago ? String(pago).substring(0, 10) : null,
    status, forma: pg.billingType || null, invoice_url: pg.invoiceUrl || pg.bankSlipUrl || null,
    ...(nfUrl ? { nf_url: nfUrl } : {}), updated_at: new Date().toISOString(),
  }, { onConflict: 'asaas_payment_id' });

  await aplicarSituacao(db, empresaId, clienteId);
  return clienteId;
}

/** Atraso e suspensão automática do app (o rastreador segue funcionando para o instalador). */
export async function aplicarSituacao(db: SupabaseClient, empresaId: string, clienteId: string, cfgPronta?: ConfigCobranca) {
  const cfg = cfgPronta || await carregarConfig(db, empresaId);
  const hoje = hojeBR();
  const [{ data: vencida }, { data: cli }] = await Promise.all([
    db.from('rastreio_cobrancas').select('vencimento').eq('cliente_id', clienteId).in('status', STATUS_ABERTOS).lt('vencimento', hoje).order('vencimento').limit(1),
    db.from('rastreio_clientes').select('status, suspenso_automatico, em_atraso_desde').eq('id', clienteId).maybeSingle(),
  ]);
  if (!cli) return;
  const atraso = vencida?.[0]?.vencimento || null;
  const patch: Record<string, unknown> = {};
  if (atraso !== cli.em_atraso_desde) patch.em_atraso_desde = atraso;
  if (atraso && cli.status === 'ativo' && cfg.dias_suspensao > 0 && diasEntre(atraso, hoje) >= cfg.dias_suspensao) {
    patch.status = 'suspenso'; patch.suspenso_automatico = true;
  }
  if (!atraso && cli.status === 'suspenso' && cli.suspenso_automatico) {
    patch.status = 'ativo'; patch.suspenso_automatico = false;
  }
  if (Object.keys(patch).length) await db.from('rastreio_clientes').update(patch).eq('id', clienteId);
}

export async function sincronizarCliente(db: SupabaseClient, empresaId: string, clienteId: string) {
  const ig = await integracaoAsaas(db, empresaId);
  const { data: c } = await db.from('rastreio_clientes').select('asaas_assinatura_id, asaas_customer_id').eq('id', clienteId).maybeSingle();
  if (!ig || (!c?.asaas_assinatura_id && !c?.asaas_customer_id)) return 0;
  // Mensalidades (assinatura) + cobranças avulsas (instalação, equipamento...) do cliente
  const [assin, avulsas] = await Promise.all([
    c.asaas_assinatura_id ? asaas(ig.key, ig.amb, 'GET', `/subscriptions/${c.asaas_assinatura_id}/payments?limit=24`).catch(() => ({ data: [] })) : { data: [] },
    asaas(ig.key, ig.amb, 'GET', `/payments?externalReference=${encodeURIComponent(`rastreio:${clienteId}`)}&limit=50`).catch(() => ({ data: [] })),
  ]);
  const vistos = new Set<string>();
  let n = 0;
  for (const pg of [...(assin.data || []), ...(avulsas.data || [])] as PagamentoAsaas[]) {
    if (vistos.has(pg.id)) continue;
    vistos.add(pg.id);
    if (await registrarPagamento(db, empresaId, pg, ig)) n++;
  }
  return n;
}

// ── Cobrança avulsa: instalação, equipamento, visita técnica... ─────────────────────────────

/** Boleto, Pix ou cartão (à vista ou parcelado) fora da mensalidade. */
export async function criarCobrancaAvulsa(db: SupabaseClient, empresaId: string, clienteId: string, p: {
  valor: number; descricao: string; vencimento: string; forma?: string; parcelas?: number;
}) {
  const ig = await integracaoAsaas(db, empresaId);
  if (!ig) throw new Error('Conecte a conta Asaas da empresa primeiro (Financeiro do rastreio → Conectar Asaas).');
  const { data: c } = await db.from('rastreio_clientes').select('*').eq('id', clienteId).eq('empresa_id', empresaId).maybeSingle();
  if (!c) throw new Error('Cliente não encontrado.');
  const valor = Math.round(Number(p.valor) * 100) / 100;
  if (!(valor >= 5)) throw new Error('Valor mínimo de R$ 5,00.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.vencimento)) || p.vencimento < hojeBR()) throw new Error('Vencimento inválido (hoje ou depois).');
  const forma: Forma = FORMAS.includes(p.forma as Forma) ? (p.forma as Forma) : 'UNDEFINED';
  const parcelas = Math.min(Math.max(Math.round(Number(p.parcelas) || 1), 1), 12);
  if (parcelas > 1 && forma === 'PIX') throw new Error('Pix não parcela: use boleto ou cartão.');
  if (parcelas > 1 && valor / parcelas < 5) throw new Error('Cada parcela precisa ter pelo menos R$ 5,00.');
  const cfg = await carregarConfig(db, empresaId);
  const customer = await garantirClienteAsaas(db, ig, c as Cliente);
  const descricao = (p.descricao || 'Serviço de rastreamento').trim().slice(0, 200);

  const pg = await asaas(ig.key, ig.amb, 'POST', '/payments', {
    customer, billingType: forma, dueDate: p.vencimento, description: descricao,
    externalReference: `rastreio:${clienteId}`,
    ...(parcelas > 1 ? { installmentCount: parcelas, totalValue: valor } : { value: valor }),
    fine: { value: cfg.multa_pct }, interest: { value: cfg.juros_mes_pct },
    split: montarSplit(cfg),
  });
  await registrarPagamento(db, empresaId, pg, ig).catch(() => null);
  if (parcelas > 1) await sincronizarCliente(db, empresaId, clienteId).catch(() => null);
  return { id: pg.id as string, link: (pg.invoiceUrl || pg.bankSlipUrl || null) as string | null };
}

async function pagamentoDaEmpresa(db: SupabaseClient, empresaId: string, cobrancaId: number) {
  const ig = await integracaoAsaas(db, empresaId);
  if (!ig) throw new Error('Asaas não conectado.');
  const { data: cob } = await db.from('rastreio_cobrancas').select('asaas_payment_id, cliente_id, valor, status').eq('id', cobrancaId).eq('empresa_id', empresaId).maybeSingle();
  if (!cob) throw new Error('Cobrança não encontrada.');
  return { ig, cob };
}

/** Cliente pagou em mãos (dinheiro, maquininha): dá baixa no Asaas e libera o app. */
export async function receberEmDinheiro(db: SupabaseClient, empresaId: string, cobrancaId: number) {
  const { ig, cob } = await pagamentoDaEmpresa(db, empresaId, cobrancaId);
  if (STATUS_PAGOS.includes(cob.status)) throw new Error('Essa cobrança já está paga.');
  const pg = await asaas(ig.key, ig.amb, 'POST', `/payments/${cob.asaas_payment_id}/receiveInCash`, {
    paymentDate: hojeBR(), value: Number(cob.valor), notifyCustomer: false,
  });
  await registrarPagamento(db, empresaId, pg, ig);
}

/** Remove a cobrança no Asaas (o link/boleto deixa de valer). */
export async function cancelarCobranca(db: SupabaseClient, empresaId: string, cobrancaId: number) {
  const { ig, cob } = await pagamentoDaEmpresa(db, empresaId, cobrancaId);
  if (STATUS_PAGOS.includes(cob.status)) throw new Error('Cobrança paga não pode ser cancelada (faça o estorno no Asaas).');
  await asaas(ig.key, ig.amb, 'DELETE', `/payments/${cob.asaas_payment_id}`);
  await db.from('rastreio_cobrancas').update({ status: 'DELETED', updated_at: new Date().toISOString() }).eq('id', cobrancaId);
  await aplicarSituacao(db, empresaId, cob.cliente_id);
}

/** Sincroniza todos os clientes com assinatura e reavalia atraso/suspensão de todos. */
export async function sincronizarEmpresa(db: SupabaseClient, empresaId: string) {
  const cfg = await carregarConfig(db, empresaId);
  const { data: clientes } = await db.from('rastreio_clientes').select('id, asaas_assinatura_id, asaas_customer_id').eq('empresa_id', empresaId).neq('status', 'cancelado');
  let pagamentos = 0, erros = 0;
  for (const c of clientes || []) {
    if (c.asaas_assinatura_id || c.asaas_customer_id) pagamentos += await sincronizarCliente(db, empresaId, c.id).catch(() => { erros++; return 0; });
    await aplicarSituacao(db, empresaId, c.id, cfg);
  }
  return { clientes: (clientes || []).length, pagamentos, erros };
}
