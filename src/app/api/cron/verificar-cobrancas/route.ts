import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { asaas, STATUS_ASAAS_PAGOS } from '@/lib/asaas';
import { confirmarPagamentoCobranca } from '@/lib/financeiro-pagamento';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Verificação automática de boleto/Pix pendente — não depende de ninguém clicar em
// "Verificar" nem do webhook da Asaas ter chegado (pode não estar configurado, ter falhado
// pontualmente, ou o pagamento ter acontecido antes da empresa configurar o webhook). Roda
// sozinho pra cada empresa com Asaas conectado, consultando o status real de toda cobrança
// ainda pendente e confirmando (mesma lógica do webhook/verificação manual) o que já foi
// pago. Não substitui o webhook (que é instantâneo) — é a rede de segurança que fecha o
// buraco de quando ele não chega.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = db();
  const resultado = { empresasVerificadas: 0, cobrancasChecadas: 0, marcadasComoPagas: 0, erros: [] as string[] };

  const { data: integracoes } = await supabase
    .from('financeiro_integracoes')
    .select('empresa_id, asaas_api_key, ambiente')
    .not('asaas_api_key', 'is', null);

  for (const integracao of integracoes || []) {
    resultado.empresasVerificadas++;
    try {
      // cobrancas_manuais é jsonb — filtra "tem pelo menos uma pendente" com um operador de
      // texto (mais simples e portável que escrever a condição em jsonb path pra cada linha);
      // o filtro fino (ignorar paga/cancelada de verdade) acontece abaixo, em JS.
      const { data: leads } = await supabase
        .from('leads')
        .select('id, cobrancas_manuais')
        .eq('empresa_id', integracao.empresa_id)
        .eq('status', 'ganho')
        .not('cobrancas_manuais', 'is', null)
        .limit(500);

      for (const lead of leads || []) {
        const cobrancas = Array.isArray(lead.cobrancas_manuais) ? lead.cobrancas_manuais : [];
        const pendentes = cobrancas.filter((c: any) => !c.pago && !c.cancelada && c.asaasPaymentId);
        for (const c of pendentes) {
          resultado.cobrancasChecadas++;
          try {
            const pagamento = await asaas(integracao.asaas_api_key, integracao.ambiente, 'GET', `/payments/${c.asaasPaymentId}`);
            if (STATUS_ASAAS_PAGOS.includes(pagamento.status)) {
              const dataPagamento = pagamento.paymentDate || pagamento.confirmedDate || new Date().toISOString().substring(0, 10);
              const r = await confirmarPagamentoCobranca(supabase, lead.id, c.asaasPaymentId, dataPagamento);
              if (r.ok && !r.jaEstavaPago) resultado.marcadasComoPagas++;
            }
          } catch (err: any) {
            resultado.erros.push(`lead ${lead.id} / ${c.asaasPaymentId}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      resultado.erros.push(`empresa ${integracao.empresa_id}: ${err.message}`);
    }
  }

  console.log('[cron/verificar-cobrancas]', JSON.stringify(resultado));
  return NextResponse.json({ ok: true, ...resultado });
}
