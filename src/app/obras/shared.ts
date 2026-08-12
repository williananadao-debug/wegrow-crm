export type Obra = {
  id: number;
  nome: string;
  endereco: string | null;
  status: 'planejamento' | 'em_andamento' | 'concluida' | 'paralisada';
  data_inicio: string | null;
  data_prevista_fim: string | null;
  data_fim_real: string | null;
  valor_orcado_total: number | null;
  responsavel_id: string | null;
  empresa_id: string;
  created_at: string;
};

export type ObraEtapa = {
  id: number;
  obra_id: number;
  nome: string;
  ordem: number;
  peso_percentual: number | null;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  percentual_previsto: number;
  percentual_executado: number;
  status: 'nao_iniciada' | 'em_andamento' | 'concluida' | 'atrasada';
};

export type ObraContratado = {
  id: number;
  obra_id: number;
  nome: string;
  documento: string | null;
  tipo_servico: string | null;
  valor_contrato: number | null;
};

export type Medicao = {
  id: number;
  obra_id: number;
  obra_contratado_id: number;
  etapa_id: number | null;
  numero_medicao: number;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  valor_medido: number;
  percentual_periodo: number | null;
  status: 'rascunho' | 'em_aprovacao' | 'aprovada' | 'rejeitada' | 'paga';
  aprovado_por: string | null;
  aprovado_em: string | null;
  lancamento_id: number | null;
};

export const OBRA_STATUS_LABELS: Record<Obra['status'], string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  paralisada: 'Paralisada',
};

export const OBRA_STATUS_CORES: Record<Obra['status'], string> = {
  planejamento: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  em_andamento: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  concluida: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
  paralisada: 'text-red-400 bg-red-500/10 border-red-500/20',
};

export const ETAPA_STATUS_LABELS: Record<ObraEtapa['status'], string> = {
  nao_iniciada: 'Não Iniciada',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
};

export const MEDICAO_STATUS_LABELS: Record<Medicao['status'], string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em Aprovação',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  paga: 'Paga',
};

export const MEDICAO_STATUS_CORES: Record<Medicao['status'], string> = {
  rascunho: 'text-slate-400 bg-white/5 border-white/10',
  em_aprovacao: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  aprovada: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  rejeitada: 'text-red-400 bg-red-500/10 border-red-500/20',
  paga: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
};

export const formatObraId = (id: number) => `OB-${String(id).padStart(4, '0')}`;

export const fmtMoeda = (v: number | null | undefined) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export const fmtData = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR'); }
  catch { return d; }
};
