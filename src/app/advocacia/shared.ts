// Tokens de cor, tipos e formatters do módulo Advocacia — paleta idêntica à vertical
// "licitação" do Argus (creme/dourado/serifado), ver src/app/argus/shared.ts. Módulo novo,
// sem variante de vertical (ao contrário do Argus, que bifurca licitação/veículos).

export type AdvocaciaProcesso = {
  id: number;
  empresa_id: string;
  lead_id: number | null;
  client_id: number | null;
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

export type AdvocaciaDocumento = {
  id: number;
  empresa_id: string;
  client_id: number | null;
  lead_id: number | null;
  processo_id: number | null;
  categoria: 'procuracao' | 'documento_pessoal' | 'contrato' | 'peticao' | 'comprovante' | 'outro';
  titulo: string;
  arquivo_url: string | null;
  arquivo_path: string;
  tamanho_bytes: number | null;
  responsavel_nome: string | null;
  user_id: string | null;
  created_at: string;
};

export const CATEGORIA_DOCUMENTO_LABELS: Record<AdvocaciaDocumento['categoria'], string> = {
  procuracao: 'Procuração',
  documento_pessoal: 'Documento pessoal (RG/CPF)',
  contrato: 'Contrato',
  peticao: 'Petição',
  comprovante: 'Comprovante',
  outro: 'Outro',
};

// Mesma tabela `clientes` usada em src/app/customers/page.tsx — Advocacia não duplica
// cadastro de cliente, só desenha uma casca visual própria por cima.
export type Cliente = {
  id: number;
  nome_empresa: string;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
  status: 'ativo' | 'inativo';
  cidade: string | null;
  endereco: string | null;
  created_at: string;
};

export function validarCNPJ(cnpj: string): boolean {
  const s = cnpj.replace(/\D/g, '');
  if (s.length !== 14 || /^(\d)\1+$/.test(s)) return false;
  const calc = (x: string, len: number) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += parseInt(x[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return r === parseInt(x[len]);
  };
  return calc(s, 12) && calc(s, 13);
}

export function validarCPF(cpf: string): boolean {
  const s = cpf.replace(/\D/g, '');
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(s[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return (r === 10 ? 0 : r) === parseInt(s[len]);
  };
  return calc(9) && calc(10);
}

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

export type AdvocaciaTarefa = {
  id: number;
  processo_id: number;
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'pendente' | 'em_andamento' | 'concluida';
  data_prevista: string | null;
  concluida_em: string | null;
  created_at: string;
};

export const PRIORIDADE_TAREFA_LABELS: Record<AdvocaciaTarefa['prioridade'], string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};
export const PRIORIDADE_TAREFA_CORES: Record<AdvocaciaTarefa['prioridade'], string> = {
  baixa: 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]',
  media: 'text-[#1d6fd9] bg-[#e8f0fd] border-[#c9dcf7]',
  alta: 'text-[#d9861c] bg-[#fdf0d4] border-[#f3ddab]',
  urgente: 'text-[#d13b3b] bg-[#fbe4e4] border-[#f2c2c2]',
};

export const STATUS_TAREFA_LABELS: Record<AdvocaciaTarefa['status'], string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída',
};
export const STATUS_TAREFA_CORES: Record<AdvocaciaTarefa['status'], string> = {
  pendente: 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]',
  em_andamento: 'text-[#1d6fd9] bg-[#e8f0fd] border-[#c9dcf7]',
  concluida: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
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
