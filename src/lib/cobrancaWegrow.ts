// Cobrança recorrente da própria WeGrow (mensalidade de quem assina o sistema) pela conta Asaas
// da WeGrow. Não confundir com /api/financeiro/*, que é o TENANT cobrando os clientes DELE.
//
//  salvarAssinatura()    → cria/atualiza a assinatura mensal no Asaas, já com o split do parceiro
//  registrarPagamento()  → espelha um pagamento do Asaas em wegrow_pagamentos (webhook/cron) e
//                          aplica os efeitos: próximo vencimento, atraso, libera acesso suspenso
//  rodarRegua()          → lembrete antes do vencimento, avisos depois e, se ligado, suspensão
//
// Split: a comissão do parceiro (parceiros.comissao_pct) vai pra carteira Asaas dele
// (parceiros.asaas_wallet_id) no ato do pagamento. Base 'bruto' = % do valor cheio da
// mensalidade (fixedValue); 'liquido' = % do valor depois da tarifa do Asaas (percentualValue).
import { SupabaseClient } from '@supabase/supabase-js';
import { asaasWegrow } from '@/lib/nfWegrow';

export const STATUS_PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const STATUS_ABERTOS = ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'];

export type ConfigCobranca = {
  regua_ativa: boolean;
  dias_lembrete: number;
  suspensao_automatica: boolean;
  dias_suspensao: number;
  multa_pct: number;
  juros_mes_pct: number;
};

const CONFIG_PADRAO: ConfigCobranca = { regua_ativa: true, dias_lembrete: 3, suspensao_automatica: false, dias_suspensao: 15, multa_pct: 2, juros_mes_pct: 1 };

export async function carregarConfigCobranca(db: SupabaseClient): Promise<ConfigCobranca> {
  const { data } = await db.from('wegrow_cobranca_config').select('*').eq('id', 1).maybeSingle();
  return { ...CONFIG_PADRAO, ...(data || {}) };
}

// Data de hoje no fuso de Brasília (o cron roda em UTC)
export function hojeBR(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().substring(0, 10);
}

function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400_000);
}

function somarMes(d: string) {
  const [a, m, dia] = d.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m, 1)); // primeiro dia do mês seguinte
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return alvo.toISOString().substring(0, 10);
}

const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '—');

async function garantirClienteAsaas(db: SupabaseClient, empresaId: string, billing: any, nomeEmpresa: string) {
  const razaoSocial = billing?.razao_social || nomeEmpresa;
  const cnpj = String(billing?.cnpj || '').replace(/\D/g, '');
  const email = billing?.email_financeiro || billing?.contrato_signer_email || undefined;
  if (!razaoSocial || !cnpj) throw new Error('Falta razão social ou CNPJ do cliente (aba Documentos/Faturamento).');

  let customerId = billing?.asaas_customer_id as string | undefined;
  if (!customerId) {
    const busca = await asaasWegrow('GET', `/customers?cpfCnpj=${cnpj}`);
    customerId = busca.data?.[0]?.id;
    if (!customerId) customerId = (await asaasWegrow('POST', '/customers', { name: razaoSocial, cpfCnpj: cnpj, email })).id;
    await db.from('clientes_wegrow').update({ asaas_customer_id: customerId }).eq('empresa_id', empresaId);
  }
  return { customerId: customerId!, razaoSocial };
}

// Split do parceiro da empresa (nenhum se a empresa não tem parceiro, ele está pausado ou ainda
// não informou a carteira Asaas)
async function montarSplit(db: SupabaseClient, parceiroId: string | null, valor: number) {
  if (!parceiroId) return { split: [] as any[], parceiro: null as any };
  const { data: parceiro } = await db.from('parceiros').select('id, nome, ativo, comissao_pct, asaas_wallet_id, split_base').eq('id', parceiroId).maybeSingle();
  const pct = Number(parceiro?.comissao_pct) || 0;
  if (!parceiro?.ativo || !parceiro.asaas_wallet_id || pct <= 0) return { split: [], parceiro };
  const item = parceiro.split_base === 'liquido'
    ? { walletId: parceiro.asaas_wallet_id, percentualValue: pct }
    : { walletId: parceiro.asaas_wallet_id, fixedValue: Math.round(valor * pct) / 100 };
  return { split: [item], parceiro };
}

export type Forma = 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';

export async function salvarAssinatura(db: SupabaseClient, empresaId: string, p: { forma?: Forma; proximoVencimento?: string | null }) {
  const [{ data: empresa }, { data: billing }, config] = await Promise.all([
    db.from('empresas').select('nome, parceiro_id').eq('id', empresaId).maybeSingle(),
    db.from('clientes_wegrow').select('*').eq('empresa_id', empresaId).maybeSingle(),
    carregarConfigCobranca(db),
  ]);
  if (!empresa) throw new Error('Empresa não encontrada.');
  const valor = Number(billing?.valor_mensal || 0);
  if (!valor) throw new Error('Falta o valor mensal (aba Faturamento).');
  const forma: Forma = p.forma || (billing?.forma_pagamento as Forma) || 'UNDEFINED';
  const vencimento = p.proximoVencimento || billing?.proximo_vencimento || null;

  const { customerId, razaoSocial } = await garantirClienteAsaas(db, empresaId, billing, empresa.nome);
  const { split, parceiro } = await montarSplit(db, empresa.parceiro_id, valor);
  const corpo: any = {
    billingType: forma,
    value: valor,
    description: `Assinatura WeGrow — ${razaoSocial}`,
    externalReference: empresaId,
    fine: { value: Number(config.multa_pct) || 0 },
    interest: { value: Number(config.juros_mes_pct) || 0 },
    split,
  };

  let assinatura: any;
  if (billing?.asaas_subscription_id && billing?.assinatura_status === 'ativa') {
    // Muda valor/forma/split também das mensalidades já geradas e ainda não pagas
    assinatura = await asaasWegrow('PUT', `/subscriptions/${billing.asaas_subscription_id}`, {
      ...corpo, ...(vencimento ? { nextDueDate: vencimento } : {}), updatePendingPayments: true,
    });
  } else {
    if (!vencimento) throw new Error('Informe o próximo vencimento (aba Faturamento).');
    if (vencimento < hojeBR()) throw new Error('O próximo vencimento já passou — ajuste a data antes de criar a assinatura.');
    assinatura = await asaasWegrow('POST', '/subscriptions', { ...corpo, customer: customerId, nextDueDate: vencimento, cycle: 'MONTHLY' });
  }

  await db.from('clientes_wegrow').update({
    asaas_subscription_id: assinatura.id, assinatura_status: 'ativa', forma_pagamento: forma,
    ...(vencimento ? { proximo_vencimento: vencimento } : {}),
  }).eq('empresa_id', empresaId);

  const pagamentos = await sincronizarAssinatura(db, empresaId);
  return { assinatura, pagamentos, splitParceiro: parceiro ? { nome: parceiro.nome, ativo: split.length > 0, semCarteira: !parceiro.asaas_wallet_id } : null };
}

export async function cancelarAssinatura(db: SupabaseClient, empresaId: string) {
  const { data: billing } = await db.from('clientes_wegrow').select('asaas_subscription_id').eq('empresa_id', empresaId).maybeSingle();
  if (!billing?.asaas_subscription_id) throw new Error('Esse cliente não tem assinatura.');
  await asaasWegrow('DELETE', `/subscriptions/${billing.asaas_subscription_id}`);
  await db.from('clientes_wegrow').update({ assinatura_status: 'cancelada' }).eq('empresa_id', empresaId);
}

// Puxa do Asaas os pagamentos da assinatura do cliente (rede de segurança do webhook)
export async function sincronizarAssinatura(db: SupabaseClient, empresaId: string) {
  const { data: billing } = await db.from('clientes_wegrow').select('asaas_subscription_id').eq('empresa_id', empresaId).maybeSingle();
  if (!billing?.asaas_subscription_id) return [];
  const r = await asaasWegrow('GET', `/subscriptions/${billing.asaas_subscription_id}/payments?limit=24`);
  const linhas = [];
  for (const pg of r.data || []) linhas.push(await registrarPagamento(db, pg, empresaId));
  return linhas.filter(Boolean);
}

// Espelha um pagamento do Asaas e aplica os efeitos no cliente. Retorna null se o pagamento
// não é de uma mensalidade WeGrow (ex.: cobrança avulsa de outra coisa).
export async function registrarPagamento(db: SupabaseClient, pg: any, empresaIdConhecida?: string) {
  let empresaId = empresaIdConhecida || null;
  if (!empresaId && pg.subscription) {
    const { data } = await db.from('clientes_wegrow').select('empresa_id').eq('asaas_subscription_id', pg.subscription).maybeSingle();
    empresaId = data?.empresa_id || null;
  }
  if (!empresaId && pg.externalReference) {
    const { data } = await db.from('clientes_wegrow').select('empresa_id').eq('empresa_id', pg.externalReference).maybeSingle();
    empresaId = data?.empresa_id || null;
  }
  if (!empresaId) return null;

  const { data: empresa } = await db.from('empresas').select('parceiro_id, bloqueio_cobranca_em').eq('id', empresaId).maybeSingle();
  const s = Array.isArray(pg.split) ? pg.split[0] : null;
  const splitValor = s ? (s.totalValue ?? s.fixedValue ?? (s.percentualValue && pg.netValue ? Math.round(pg.netValue * s.percentualValue) / 100 : null)) : null;
  const pagoEm = pg.clientPaymentDate || pg.paymentDate || pg.confirmedDate || null;
  const status = pg.deleted ? 'DELETED' : pg.status;

  const linha = {
    asaas_payment_id: pg.id,
    asaas_subscription_id: pg.subscription || null,
    empresa_id: empresaId,
    parceiro_id: empresa?.parceiro_id || null,
    competencia: String(pg.dueDate || '').substring(0, 7) || null,
    valor: Number(pg.value) || 0,
    valor_liquido: pg.netValue != null ? Number(pg.netValue) : null,
    vencimento: pg.dueDate || null,
    pago_em: pagoEm ? String(pagoEm).substring(0, 10) : null,
    status,
    forma: pg.billingType || null,
    invoice_url: pg.invoiceUrl || pg.bankSlipUrl || null,
    split_valor: splitValor,
    split_status: s?.status || null,
    updated_at: new Date().toISOString(),
  };
  const { data: salvo } = await db.from('wegrow_pagamentos').upsert(linha, { onConflict: 'asaas_payment_id' }).select().single();

  // Efeitos no cliente
  const { data: billing } = await db.from('clientes_wegrow').select('proximo_vencimento, em_atraso_desde').eq('empresa_id', empresaId).maybeSingle();
  const { data: abertosVencidos } = await db.from('wegrow_pagamentos').select('vencimento')
    .eq('empresa_id', empresaId).in('status', STATUS_ABERTOS).lt('vencimento', hojeBR()).order('vencimento').limit(1);
  const atrasoDesde = abertosVencidos?.[0]?.vencimento || null;
  const patch: Record<string, any> = { em_atraso_desde: atrasoDesde };

  if (STATUS_PAGOS.includes(status) && pg.dueDate) {
    const seguinte = somarMes(pg.dueDate);
    if (!billing?.proximo_vencimento || billing.proximo_vencimento < seguinte) patch.proximo_vencimento = seguinte;
  }
  // Compatibilidade com a tela atual (link/status da "última cobrança") e o cron da NF
  if (STATUS_ABERTOS.includes(status) || STATUS_PAGOS.includes(status)) {
    patch.ultima_cobranca_id = pg.id;
    patch.ultima_cobranca_tipo = pg.billingType || null;
    patch.ultima_cobranca_url = linha.invoice_url;
    patch.ultima_cobranca_status = status;
  }
  await db.from('clientes_wegrow').update(patch).eq('empresa_id', empresaId);

  // Pagou tudo o que estava vencido → libera o acesso suspenso
  if (!atrasoDesde && empresa?.bloqueio_cobranca_em) {
    await db.from('empresas').update({ bloqueio_cobranca_em: null }).eq('id', empresaId);
    console.log(`[cobrancaWegrow] acesso liberado empresa=${empresaId}`);
  }
  return salvo;
}

// ─── Régua de cobrança ───────────────────────────────────────────────────────────

type Etapa = 'lembrete' | 'vencido' | 'atraso_5' | 'aviso_suspensao' | 'suspenso';

function etapaDoDia(dias: number, c: ConfigCobranca): Etapa | null {
  // dias = hoje − vencimento (negativo = ainda vai vencer)
  if (dias < 0) return -dias <= c.dias_lembrete ? 'lembrete' : null;
  if (dias === 0) return null; // o próprio Asaas avisa no dia
  if (c.suspensao_automatica && dias >= c.dias_suspensao) return 'suspenso';
  if (c.suspensao_automatica && dias >= c.dias_suspensao - 3) return 'aviso_suspensao';
  if (dias >= 5) return 'atraso_5';
  return 'vencido';
}

export async function rodarRegua(db: SupabaseClient) {
  const config = await carregarConfigCobranca(db);
  const hoje = hojeBR();
  const resultado = { enviados: 0, suspensas: 0, erros: [] as string[] };

  const desde = new Date(Date.parse(hoje) - 90 * 86400_000).toISOString().substring(0, 10);
  const ate = new Date(Date.parse(hoje) + config.dias_lembrete * 86400_000).toISOString().substring(0, 10);
  const { data: abertos } = await db.from('wegrow_pagamentos').select('*')
    .in('status', STATUS_ABERTOS).gte('vencimento', desde).lte('vencimento', ate);

  for (const pg of abertos || []) {
    const etapa = etapaDoDia(diasEntre(pg.vencimento, hoje), config);
    if (!etapa) continue;
    try {
      if (etapa === 'suspenso') {
        const { data: emp } = await db.from('empresas').select('bloqueio_cobranca_em').eq('id', pg.empresa_id).maybeSingle();
        if (emp && !emp.bloqueio_cobranca_em) {
          await db.from('empresas').update({ bloqueio_cobranca_em: new Date().toISOString() }).eq('id', pg.empresa_id);
          resultado.suspensas++;
          console.log(`[cobrancaWegrow] acesso suspenso empresa=${pg.empresa_id} pagamento=${pg.asaas_payment_id}`);
        }
      }
      if (!config.regua_ativa) continue;
      if (await enviarEtapa(db, pg, etapa, config)) resultado.enviados++;
    } catch (err: any) {
      resultado.erros.push(`${pg.asaas_payment_id}/${etapa}: ${err.message}`);
    }
  }
  return resultado;
}

const TEXTOS: Record<Etapa, (pg: any, c: ConfigCobranca) => { assunto: string; titulo: string; texto: string }> = {
  lembrete: pg => ({
    assunto: `Sua mensalidade WeGrow vence em ${dataBR(pg.vencimento)}`,
    titulo: 'Lembrete de vencimento',
    texto: `A mensalidade de ${moeda(pg.valor)} vence em ${dataBR(pg.vencimento)}. O boleto e o Pix já estão disponíveis no link abaixo.`,
  }),
  vencido: pg => ({
    assunto: 'Mensalidade WeGrow em aberto',
    titulo: 'Não identificamos o pagamento',
    texto: `A mensalidade de ${moeda(pg.valor)} venceu em ${dataBR(pg.vencimento)}. Se já pagou, desconsidere; senão, o link abaixo traz o valor atualizado.`,
  }),
  atraso_5: pg => ({
    assunto: 'Mensalidade WeGrow em atraso',
    titulo: 'Mensalidade em atraso',
    texto: `A mensalidade de ${moeda(pg.valor)}, vencida em ${dataBR(pg.vencimento)}, continua em aberto. Regularize pelo link abaixo para manter o acesso da sua equipe.`,
  }),
  aviso_suspensao: (pg, c) => ({
    assunto: 'Aviso: acesso ao WeGrow será suspenso',
    titulo: 'Seu acesso será suspenso',
    texto: `A mensalidade vencida em ${dataBR(pg.vencimento)} segue em aberto. Com ${c.dias_suspensao} dias de atraso o acesso ao sistema é suspenso. Os dados ficam guardados e o acesso volta assim que o pagamento é confirmado.`,
  }),
  suspenso: pg => ({
    assunto: 'Acesso ao WeGrow suspenso por pendência financeira',
    titulo: 'Acesso suspenso',
    texto: `Por causa da mensalidade vencida em ${dataBR(pg.vencimento)}, o acesso da sua equipe foi suspenso. Os dados estão guardados: pague pelo link abaixo e o acesso volta sozinho em poucos minutos após a confirmação.`,
  }),
};

async function enviarEtapa(db: SupabaseClient, pg: any, etapa: Etapa, config: ConfigCobranca) {
  if (!process.env.RESEND_API_KEY || !pg.invoice_url) return false;
  const { data: billing } = await db.from('clientes_wegrow').select('email_financeiro, contrato_signer_email, razao_social').eq('empresa_id', pg.empresa_id).maybeSingle();
  const para = billing?.email_financeiro || billing?.contrato_signer_email;
  if (!para) return false;

  // Reserva a etapa antes de mandar: dois crons simultâneos não duplicam o e-mail
  const { data: reservado } = await db.from('wegrow_regua_envios')
    .upsert({ asaas_payment_id: pg.asaas_payment_id, etapa, email_para: para }, { onConflict: 'asaas_payment_id,etapa', ignoreDuplicates: true })
    .select();
  if (!reservado?.length) return false;

  const t = TEXTOS[etapa](pg, config);
  try {
    const { Resend } = await import('resend');
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
      to: [para],
      subject: t.assunto,
      html: emailHtml(t.titulo, t.texto, pg, billing?.razao_social || ''),
    });
    return true;
  } catch (err) {
    await db.from('wegrow_regua_envios').delete().eq('asaas_payment_id', pg.asaas_payment_id).eq('etapa', etapa);
    throw err;
  }
}

function emailHtml(titulo: string, texto: string, pg: any, cliente: string) {
  return `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">
      <tr><td style="background:#22c55e;padding:24px 32px">
        <span style="font-size:22px;font-weight:900;font-style:italic;color:#0f172a;letter-spacing:-1px">WEGROW</span>
      </td></tr>
      <tr><td style="padding:32px">
        <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#fff">${titulo}</p>
        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">${cliente ? `<strong style="color:#fff">${cliente}</strong> · ` : ''}${texto}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:24px">
          <tr><td style="padding:14px 20px;border-bottom:1px solid #1e293b">
            <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">Vencimento</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:#fff">${dataBR(pg.vencimento)}</p>
          </td></tr>
          <tr><td style="padding:14px 20px">
            <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">Valor</p>
            <p style="margin:0;font-size:20px;font-weight:900;color:#22c55e">${moeda(pg.valor)}</p>
          </td></tr>
        </table>
        <a href="${pg.invoice_url}" style="display:inline-block;background:#22c55e;color:#0f172a;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding:14px 28px;border-radius:10px;text-decoration:none">Pagar agora</a>
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #1e293b">
        <p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow · Willian da Silva Anadao Tecnologia da Informação LTDA</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Comissão/carteira/base do parceiro mudou (ou a empresa trocou de parceiro): reaplica o split
// nas assinaturas ativas, inclusive nas mensalidades já geradas e ainda não pagas.
export async function reaplicarSplitCarteira(db: SupabaseClient, parceiroId: string) {
  const { data: empresas } = await db.from('empresas').select('id').eq('parceiro_id', parceiroId);
  const ids = (empresas || []).map(e => e.id);
  if (ids.length === 0) return { atualizadas: 0, erros: [] as string[] };
  const { data: ativas } = await db.from('clientes_wegrow').select('empresa_id').in('empresa_id', ids).eq('assinatura_status', 'ativa');
  let atualizadas = 0;
  const erros: string[] = [];
  for (const a of ativas || []) {
    try { await salvarAssinatura(db, a.empresa_id, {}); atualizadas++; }
    catch (err: any) { erros.push(`${a.empresa_id}: ${err.message}`); }
  }
  return { atualizadas, erros };
}
