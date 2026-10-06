// Data que decide em qual período um lead "conta". Ganho/perdido contam no dia em que
// foram fechados (fechado_em, preenchido por trigger no banco), não no dia em que o lead
// foi criado — senão um lead aberto em setembro e ganho em outubro caía em setembro
// (relatado pela Demais FM). Lead aberto continua pela data de criação.
// O fallback pra created_at cobre lead fechado antes da coluna existir / sem backfill.
export function dataReferenciaLead(l: { status?: string | null; created_at: string; fechado_em?: string | null }): string {
  if ((l.status === 'ganho' || l.status === 'perdido') && l.fechado_em) return l.fechado_em;
  return l.created_at;
}

// YYYY-MM-DD no fuso local (não em UTC) — fechado_em vem como timestamptz; um ganho às
// 22h do dia 31 em Brasília seria dia 1 do mês seguinte se cortado pela string UTC.
export function diaReferenciaLead(l: { status?: string | null; created_at: string; fechado_em?: string | null }): string {
  const d = new Date(dataReferenciaLead(l));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

// Instante (ISO/UTC) da meia-noite local do 1º dia do mês — pra filtrar fechado_em
// (timestamptz) por mês no banco sem deslocar as bordas pelo fuso: usar com
// .gte(inicioMesIso(a, m)).lt(inicioMesIso(a, m + 1)). Mês 1-12; m=13 vira janeiro seguinte.
export function inicioMesIso(ano: number, mes: number): string {
  return new Date(ano, mes - 1, 1).toISOString();
}
