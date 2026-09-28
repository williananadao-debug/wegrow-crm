// Cliente HTTP mínimo pra API da Asaas — cada empresa usa a própria conta/chave
// (financeiro_integracoes), nunca uma chave global da WeGrow. Extraído de
// financeiro/cobranca/route.ts pra ser reaproveitado pelo cron de verificação automática
// (cron/verificar-cobrancas) sem duplicar a mesma função em dois arquivos.
function asaasBase(ambiente: string) {
  return ambiente === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}

export async function asaas(apiKey: string, ambiente: string, method: string, path: string, body?: any) {
  const res = await fetch(`${asaasBase(ambiente)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
      'User-Agent': 'WeGrow-CRM/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.errors?.[0]?.description || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

// https://docs.asaas.com/reference/payment-status-list — só os que fazem sentido aparecer
// pra quem usa o CRM (não é uma tradução técnica completa, é o texto que ajuda a decidir).
export const STATUS_ASAAS_PT: Record<string, string> = {
  PENDING: 'Pendente', OVERDUE: 'Vencida', RECEIVED: 'Recebida', CONFIRMED: 'Confirmada',
  RECEIVED_IN_CASH: 'Recebida em dinheiro', REFUNDED: 'Estornada', REFUND_REQUESTED: 'Estorno solicitado',
  CHARGEBACK_REQUESTED: 'Chargeback solicitado', CHARGEBACK_DISPUTE: 'Em disputa de chargeback',
  AWAITING_CHARGEBACK_REVERSAL: 'Aguardando reversão de chargeback',
  DUNNING_REQUESTED: 'Em cobrança extrajudicial', DUNNING_RECEIVED: 'Recuperada via cobrança extrajudicial',
  AWAITING_RISK_ANALYSIS: 'Em análise de risco',
};

export const STATUS_ASAAS_PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
