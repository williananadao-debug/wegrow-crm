// Resumo de vencimentos do Financeiro — usado no aviso do topo da tela (/finance) e no aviso
// diário do sino (cron financeiro-vencimentos), pra os dois contarem igual.
// Considera: contas a pagar (lancamentos tipo 'saida'), contas a receber (lancamentos tipo
// 'entrada') e boletos/Pix das vendas (leads.cobrancas_manuais).

export const DIAS_AVISO_VENCIMENTO = 3;

export type ContaVenc = { valor: number | string | null; status?: string | null; data_vencimento?: string | null };
export type CobrancaVenc = { valor?: number | string | null; vencimento?: string | null; pago?: boolean; cancelada?: boolean };

export type FaixaVenc = { qtd: number; valor: number };
export type ResumoLado = { vencidas: FaixaVenc; hoje: FaixaVenc; proximas: FaixaVenc };
export type ResumoVencimentos = { pagar: ResumoLado; receber: ResumoLado };

// Data local (Brasil) em YYYY-MM-DD — toISOString() é UTC e vira o dia às 21h.
export function hojeLocal(fuso = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function somarDias(isoData: string, dias: number): string {
  const d = new Date(isoData + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().substring(0, 10);
}

export function diasAte(isoData: string, hoje: string): number {
  return Math.round((new Date(isoData + 'T12:00:00Z').getTime() - new Date(hoje + 'T12:00:00Z').getTime()) / 86400000);
}

const vazio = (): ResumoLado => ({ vencidas: { qtd: 0, valor: 0 }, hoje: { qtd: 0, valor: 0 }, proximas: { qtd: 0, valor: 0 } });

function classificar(lado: ResumoLado, venc: string | null | undefined, valor: number, hoje: string, limite: string) {
  if (!venc) return;
  const faixa = venc < hoje ? lado.vencidas : venc === hoje ? lado.hoje : venc <= limite ? lado.proximas : null;
  if (!faixa) return;
  faixa.qtd++;
  faixa.valor += valor;
}

export function resumirVencimentos(params: {
  pagar: ContaVenc[]; receber: ContaVenc[]; cobrancas: CobrancaVenc[]; hoje: string; dias?: number;
}): ResumoVencimentos {
  const limite = somarDias(params.hoje, params.dias ?? DIAS_AVISO_VENCIMENTO);
  const r: ResumoVencimentos = { pagar: vazio(), receber: vazio() };
  for (const c of params.pagar) if (c.status !== 'pago') classificar(r.pagar, c.data_vencimento, Number(c.valor) || 0, params.hoje, limite);
  for (const c of params.receber) if (c.status !== 'pago') classificar(r.receber, c.data_vencimento, Number(c.valor) || 0, params.hoje, limite);
  for (const c of params.cobrancas) if (!c.pago && !c.cancelada) classificar(r.receber, c.vencimento, Number(c.valor) || 0, params.hoje, limite);
  return r;
}

export function temAlgo(r: ResumoVencimentos) {
  const t = (l: ResumoLado) => l.vencidas.qtd + l.hoje.qtd + l.proximas.qtd;
  return t(r.pagar) + t(r.receber) > 0;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Texto curto de um lado, ex.: "2 vencidas (R$ 1.200,00), 1 vence hoje, 3 nos próximos 3 dias"
export function textoLado(l: ResumoLado, dias = DIAS_AVISO_VENCIMENTO): string {
  const partes: string[] = [];
  if (l.vencidas.qtd) partes.push(`${l.vencidas.qtd} vencida${l.vencidas.qtd > 1 ? 's' : ''} (${brl(l.vencidas.valor)})`);
  if (l.hoje.qtd) partes.push(`${l.hoje.qtd} vence${l.hoje.qtd > 1 ? 'm' : ''} hoje (${brl(l.hoje.valor)})`);
  if (l.proximas.qtd) partes.push(`${l.proximas.qtd} nos próximos ${dias} dias (${brl(l.proximas.valor)})`);
  return partes.join(', ');
}
