// NFS-e da própria WeGrow (mensalidade de quem assina o sistema), emitida pela conta Asaas
// da WeGrow (ASAAS_API_KEY) e enviada por e-mail pro financeiro do cliente. Não confundir com
// /api/financeiro/nfse, que é o TENANT emitindo nota pros clientes DELE na conta Asaas dele.
//
// Fluxo: emitirNfWegrow() cria a nota no Asaas (que transmite pra prefeitura/Portal Nacional);
// ela nasce SCHEDULED e vira AUTHORIZED em minutos — sincronizarNfWegrow() (webhook, cron
// diário ou abrir a tela de Notas fiscais) pega o número/PDF e manda o e-mail uma única vez.
import { SupabaseClient } from '@supabase/supabase-js';

const ASAAS_BASE = 'https://api.asaas.com/v3';

export async function asaasWegrow(method: string, path: string, body?: any) {
  if (!process.env.ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada no servidor.');
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: process.env.ASAAS_API_KEY, 'User-Agent': 'WeGrow-Admin/1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.errors?.[0]?.description || JSON.stringify(data));
  return data;
}

export type ConfigNf = {
  ativo: boolean;
  municipal_service_id: string | null;
  municipal_service_code: string;
  municipal_service_name: string;
  descricao: string;
  observacoes: string | null;
  iss: number;
  retain_iss: boolean;
  enviar_email: boolean;
};

export async function carregarConfigNf(db: SupabaseClient): Promise<ConfigNf | null> {
  const { data } = await db.from('wegrow_nfse_config').select('*').eq('id', 1).maybeSingle();
  return data as ConfigNf | null;
}

// 'AAAA-MM' → 'MM/AAAA' (como a competência aparece na descrição da nota)
export function competenciaLegivel(c: string) {
  const [a, m] = c.split('-');
  return `${m}/${a}`;
}

export function preencherDescricao(modelo: string, competencia: string, empresa: string) {
  return modelo.replaceAll('{competencia}', competenciaLegivel(competencia)).replaceAll('{empresa}', empresa);
}

const STATUS_FINAIS_RUINS = ['CANCELED', 'ERROR', 'CANCELLATION_DENIED'];

type Resultado = { ok: true; nota: any; jaExistia?: boolean } | { ok: false; erro: string };

export async function emitirNfWegrow(db: SupabaseClient, p: {
  empresaId: string; competencia?: string; paymentId?: string | null; origem: 'manual' | 'pagamento_recebido' | 'webhook' | 'cron';
}): Promise<Resultado> {
  const config = await carregarConfigNf(db);
  if (!config) return { ok: false, erro: 'Modelo da nota não configurado — rode a migration 20261030120000_nf_wegrow.sql.' };
  // Automático só com a chave ligada; o botão "Emitir agora" (manual) funciona sempre.
  if (p.origem !== 'manual' && !config.ativo) return { ok: false, erro: 'Emissão automática desligada.' };

  const competencia = p.competencia || new Date().toISOString().substring(0, 7);

  const { data: jaTem } = await db.from('wegrow_notas_fiscais').select('*')
    .eq('empresa_id', p.empresaId).eq('competencia', competencia).not('status', 'in', `(${STATUS_FINAIS_RUINS.join(',')})`)
    .limit(1).maybeSingle();
  if (jaTem) return { ok: true, nota: jaTem, jaExistia: true };

  const [{ data: empresa }, { data: billing }] = await Promise.all([
    db.from('empresas').select('nome').eq('id', p.empresaId).maybeSingle(),
    db.from('clientes_wegrow').select('*').eq('empresa_id', p.empresaId).maybeSingle(),
  ]);
  const razaoSocial = billing?.razao_social || empresa?.nome;
  const cnpj = String(billing?.cnpj || '').replace(/\D/g, '');
  const valor = Number(billing?.valor_mensal || 0);
  const email = billing?.email_financeiro || billing?.contrato_signer_email || null;

  const registrarErro = async (erro: string) => {
    await db.from('wegrow_notas_fiscais').insert({ empresa_id: p.empresaId, competencia, valor, status: 'ERROR', erro, email_para: email, origem: p.origem, asaas_payment_id: p.paymentId || null });
    return { ok: false as const, erro };
  };

  if (!razaoSocial || !cnpj) return registrarErro('Falta razão social ou CNPJ do cliente (aba Documentos/Faturamento).');
  if (!valor) return registrarErro('Falta o valor mensal (aba Faturamento).');

  try {
    let customerId = billing?.asaas_customer_id as string | undefined;
    if (!customerId) {
      const busca = await asaasWegrow('GET', `/customers?cpfCnpj=${cnpj}`);
      customerId = busca.data?.[0]?.id;
      if (!customerId) {
        const criado = await asaasWegrow('POST', '/customers', { name: razaoSocial, cpfCnpj: cnpj, email: email || undefined });
        customerId = criado.id;
      }
      await db.from('clientes_wegrow').update({ asaas_customer_id: customerId }).eq('empresa_id', p.empresaId);
    }

    const invoice = await asaasWegrow('POST', '/invoices', {
      ...(p.paymentId ? { payment: p.paymentId } : { customer: customerId }),
      serviceDescription: preencherDescricao(config.descricao, competencia, razaoSocial),
      observations: config.observacoes || '',
      externalReference: `${p.empresaId}:${competencia}`,
      value: valor,
      deductions: 0,
      effectiveDate: new Date().toISOString().substring(0, 10),
      ...(config.municipal_service_id
        ? { municipalServiceId: config.municipal_service_id }
        : { municipalServiceCode: config.municipal_service_code, municipalServiceName: config.municipal_service_name }),
      taxes: { retainIss: config.retain_iss, iss: Number(config.iss) || 0, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 },
    });

    const { data: nota } = await db.from('wegrow_notas_fiscais').insert({
      empresa_id: p.empresaId, competencia, valor, asaas_invoice_id: invoice.id, asaas_payment_id: p.paymentId || null,
      status: invoice.status || 'SCHEDULED', numero: invoice.number || null, pdf_url: invoice.pdfUrl || null, xml_url: invoice.xmlUrl || null,
      email_para: email, origem: p.origem,
    }).select().single();

    console.log(`[nfWegrow] emitida empresa=${p.empresaId} competencia=${competencia} invoice=${invoice.id} status=${invoice.status}`);
    if (nota && invoice.status === 'AUTHORIZED') await enviarEmailSePreciso(db, nota, config, razaoSocial);
    return { ok: true, nota };
  } catch (err: any) {
    console.error('[nfWegrow] erro ao emitir', err);
    return registrarErro(`Asaas: ${err.message}`);
  }
}

// Atualiza a nota com o que o Asaas tem agora (status, número, PDF/XML) e, se acabou de ser
// autorizada, manda o e-mail pro cliente. `invoice` já vem pronto quando é o webhook.
export async function sincronizarNfWegrow(db: SupabaseClient, nota: any, invoice?: any) {
  const inv = invoice || await asaasWegrow('GET', `/invoices/${nota.asaas_invoice_id}`);
  const patch = {
    status: inv.status,
    numero: inv.number || nota.numero,
    pdf_url: inv.pdfUrl || nota.pdf_url,
    xml_url: inv.xmlUrl || nota.xml_url,
    erro: inv.status === 'ERROR' ? (inv.statusDescription || 'Prefeitura recusou a nota.') : null,
    updated_at: new Date().toISOString(),
  };
  const { data: atualizada } = await db.from('wegrow_notas_fiscais').update(patch).eq('id', nota.id).select().single();
  if (atualizada?.status === 'AUTHORIZED') {
    const config = await carregarConfigNf(db);
    const { data: billing } = await db.from('clientes_wegrow').select('razao_social').eq('empresa_id', nota.empresa_id).maybeSingle();
    const { data: empresa } = await db.from('empresas').select('nome').eq('id', nota.empresa_id).maybeSingle();
    if (config) await enviarEmailSePreciso(db, atualizada, config, billing?.razao_social || empresa?.nome || '');
  }
  return atualizada;
}

// Notas ainda em andamento no Asaas — usadas pelo cron e ao abrir a tela.
export async function sincronizarPendentesNfWegrow(db: SupabaseClient) {
  const { data: pendentes } = await db.from('wegrow_notas_fiscais').select('*')
    .not('asaas_invoice_id', 'is', null)
    .or('status.in.(SCHEDULED,SYNCHRONIZED,PROCESSING_CANCELLATION),and(status.eq.AUTHORIZED,email_enviado_em.is.null)')
    .limit(50);
  let atualizadas = 0;
  for (const n of pendentes || []) {
    try { await sincronizarNfWegrow(db, n); atualizadas++; } catch (err) { console.error('[nfWegrow] sync', n.id, err); }
  }
  return atualizadas;
}

async function enviarEmailSePreciso(db: SupabaseClient, nota: any, config: ConfigNf, cliente: string) {
  if (!config.enviar_email || nota.email_enviado_em || !nota.email_para || !nota.pdf_url) return;
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const valor = Number(nota.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const comp = competenciaLegivel(nota.competencia);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
      to: [nota.email_para],
      subject: `Nota fiscal WeGrow — ${comp}${nota.numero ? ` · NFS-e nº ${nota.numero}` : ''}`,
      html: `
<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">
      <tr><td style="background:#22c55e;padding:24px 32px">
        <span style="font-size:22px;font-weight:900;font-style:italic;color:#0f172a;letter-spacing:-1px">WEGROW</span>
      </td></tr>
      <tr><td style="padding:32px">
        <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#fff">Sua nota fiscal chegou</p>
        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
          Segue a NFS-e referente à mensalidade WeGrow de <strong style="color:#fff">${cliente}</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:24px">
          <tr><td style="padding:14px 20px;border-bottom:1px solid #1e293b">
            <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">Competência</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:#fff">${comp}</p>
          </td></tr>
          ${nota.numero ? `<tr><td style="padding:14px 20px;border-bottom:1px solid #1e293b">
            <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">NFS-e nº</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:#fff">${nota.numero}</p>
          </td></tr>` : ''}
          <tr><td style="padding:14px 20px">
            <p style="margin:0 0 4px;font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:1px">Valor</p>
            <p style="margin:0;font-size:20px;font-weight:900;color:#22c55e">${valor}</p>
          </td></tr>
        </table>
        <a href="${nota.pdf_url}" style="display:inline-block;background:#22c55e;color:#0f172a;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding:14px 28px;border-radius:10px;text-decoration:none">Baixar nota (PDF)</a>
        ${nota.xml_url ? `<p style="margin:16px 0 0;font-size:12px"><a href="${nota.xml_url}" style="color:#94a3b8">Baixar XML</a></p>` : ''}
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #1e293b">
        <p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow · Willian da Silva Anadao Tecnologia da Informação LTDA</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`,
    });
    await db.from('wegrow_notas_fiscais').update({ email_enviado_em: new Date().toISOString() }).eq('id', nota.id);
    console.log(`[nfWegrow] e-mail enviado nota=${nota.id} para=${nota.email_para}`);
  } catch (err) {
    console.error('[nfWegrow] falha ao enviar e-mail', err);
  }
}
