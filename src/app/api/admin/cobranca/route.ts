import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const ASAAS_BASE = 'https://api.asaas.com/v3';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

async function asaas(method: string, path: string, body?: any) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: process.env.ASAAS_API_KEY!, 'User-Agent': 'WeGrow-Admin/1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errors?.[0]?.description || JSON.stringify(data));
  return data;
}

// POST — gera uma cobrança real (boleto ou Pix) via Asaas pra um cliente da WeGrow (ex:
// mensalidade). Diferente de /api/financeiro/cobranca, que é o TENANT cobrando os
// clientes DELE — aqui é a própria WeGrow cobrando quem assina o sistema.
export async function POST(request: Request) {
  const admin = await verificarAdmin(request);
  if (!admin) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  if (!process.env.ASAAS_API_KEY) return NextResponse.json({ erro: 'ASAAS_API_KEY não configurada no servidor.' }, { status: 500 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, tipo } = body as { empresa_id?: string; tipo?: 'BOLETO' | 'PIX' };
  if (!empresa_id || !tipo || !['BOLETO', 'PIX'].includes(tipo)) {
    return NextResponse.json({ erro: 'empresa_id e tipo (BOLETO|PIX) são obrigatórios.' }, { status: 422 });
  }

  const db = supabaseAdmin();
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
      const busca = await asaas('GET', `/customers?cpfCnpj=${cnpj}`);
      if (busca.data?.length > 0) {
        customerId = busca.data[0].id;
      } else {
        const criado = await asaas('POST', '/customers', {
          name: razaoSocial, cpfCnpj: cnpj,
          email: billing?.email_contato || undefined,
        });
        customerId = criado.id;
      }
    }

    const payment = await asaas('POST', '/payments', {
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
