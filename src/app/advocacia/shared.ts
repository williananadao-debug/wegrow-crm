// Tokens de cor, tipos e formatters do módulo Advocacia — paleta idêntica à vertical
// "licitação" do Argus (creme/dourado/serifado), ver src/app/argus/shared.ts. Módulo novo,
// sem variante de vertical (ao contrário do Argus, que bifurca licitação/veículos).

export type AdvocaciaProcesso = {
  id: number;
  empresa_id: string;
  lead_id: number | null;
  cliente_nome: string;
  advogado_responsavel_id: string | null;
  area_juridica: string;
  numero_processo: string | null;
  tipo_honorario: 'fixo' | 'recorrente' | 'exito' | 'hora';
  valor_causa: number | null;
  honorario_fixo: number | null;
  honorario_mensal: number | null;
  percentual_exito: number | null;
  valor_hora: number | null;
  status: 'ativo' | 'concluido' | 'encerrado' | 'arquivado';
  data_inicio: string | null;
  data_encerramento: string | null;
  created_at: string;
  updated_at: string;
};

export type AdvocaciaCanalCusto = {
  id: number;
  canal: string;
  ano: number;
  mes: number;
  valor_investido: number;
};

// Mesmo padrão de CDL_STAGES em src/app/deals/page.tsx — rótulos de etapa por tenant.
export const ADVOCACIA_STAGES: Record<number, string> = {
  0: 'Lead recebido',
  1: 'Contato feito',
  2: 'Proposta enviada',
  3: 'Negociação',
  4: 'Contrato fechado',
  5: 'Perdido',
};
export const ADVOCACIA_STAGE_GANHO = 4;
export const ADVOCACIA_STAGE_PERDIDO = 5;

export const AREAS_JURIDICAS = [
  'Cível', 'Trabalhista', 'Tributário', 'Família', 'Empresarial',
  'Criminal', 'Previdenciário', 'Consumidor', 'Outro',
] as const;

export const TIPO_HONORARIO_LABELS: Record<AdvocaciaProcesso['tipo_honorario'], string> = {
  fixo: 'Honorário fixo',
  recorrente: 'Honorário recorrente',
  exito: 'Êxito (% sobre proveito)',
  hora: 'Por hora',
};

export const STATUS_PROCESSO_LABELS: Record<AdvocaciaProcesso['status'], string> = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  encerrado: 'Encerrado',
  arquivado: 'Arquivado',
};

export const STATUS_PROCESSO_CORES: Record<AdvocaciaProcesso['status'], string> = {
  ativo: 'text-[#1d6fd9] bg-[#e8f0fd] border-[#c9dcf7]',
  concluido: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
  encerrado: 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]',
  arquivado: 'text-[#9a958a] bg-[#f0ede6] border-[#e5e0d5]',
};

export const fmtMoeda = (v: number | null | undefined) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export const fmtMoedaCompacta = (v: number | null | undefined) => {
  const n = Number(v || 0);
  if (n >= 1_000_000) return 'R$' + (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return 'R$' + (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return fmtMoeda(n);
};

export const fmtData = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); }
  catch { return d; }
};

export const fmtPct = (v: number | null | undefined) => `${Number(v || 0).toFixed(1)}%`;

// "Esfriando" — sem campo novo, só um corte sobre leads.followup_em já existente.
export const DIAS_LEAD_ESFRIANDO = 5;

export function diasDesde(data: string | null | undefined): number | null {
  if (!data) return null;
  return Math.floor((Date.now() - new Date(data).getTime()) / (1000 * 60 * 60 * 24));
}
