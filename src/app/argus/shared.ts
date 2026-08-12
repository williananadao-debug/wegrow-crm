export type ArgusEdital = {
  id: number;
  origem: 'pncp' | 'manual';
  numero_controle_pncp: string | null;
  numero_processo: string | null;
  orgao: string | null;
  modalidade: string | null;
  objeto: string | null;
  uf: string | null;
  municipio: string | null;
  status_interesse: 'candidato' | 'acompanhando' | 'proposta_enviada' | 'ganho' | 'perdido' | 'arquivado';
  estagio_processo: string | null;
  valor_estimado: number | null;
  valor_homologado: number | null;
  valor_proposto: number | null;
  margem_estimada: number | null;
  concorrentes: number | null;
  posicao_atual: string | null;
  data_sessao: string | null;
  data_encerramento_proposta: string | null;
  link_pncp: string | null;
  raw_payload: any;
  created_at: string;
  updated_at: string;
};

export type ArgusAlerta = {
  id: number;
  edital_id: number;
  severidade: 'vermelho' | 'amber' | 'verde';
  tipo: string | null;
  mensagem: string;
  resolvido: boolean;
  created_at: string;
};

export type ArgusEvento = {
  id: number;
  edital_id: number;
  titulo: string;
  descricao: string | null;
  data_evento: string;
};

export type ArgusContrato = {
  id: number;
  edital_id: number | null;
  orgao: string | null;
  objeto: string | null;
  valor_contrato: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: 'ativo' | 'encerrado' | 'rescindido';
  created_at: string;
};

export type ArgusFiltroBusca = {
  id: number;
  nome: string;
  uf: string | null;
  modalidade: number | null;
  palavras_chave: string | null;
  cnae: string | null;
  ativo: boolean;
};

export const STATUS_INTERESSE_LABELS: Record<ArgusEdital['status_interesse'], string> = {
  candidato: 'Candidato',
  acompanhando: 'Acompanhando',
  proposta_enviada: 'Proposta Enviada',
  ganho: 'Ganho',
  perdido: 'Perdido',
  arquivado: 'Arquivado',
};

export const STATUS_INTERESSE_CORES: Record<ArgusEdital['status_interesse'], string> = {
  candidato: 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]',
  acompanhando: 'text-[#1d6fd9] bg-[#e8f0fd] border-[#c9dcf7]',
  proposta_enviada: 'text-[#d9861c] bg-[#fdf0d4] border-[#f0d19a]',
  ganho: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
  perdido: 'text-[#d63f3f] bg-[#fce8e8] border-[#f5c6c6]',
  arquivado: 'text-[#9a958a] bg-[#f0ede6] border-[#e5e0d5]',
};

export const SEVERIDADE_CORES: Record<ArgusAlerta['severidade'], string> = {
  vermelho: 'text-[#d63f3f] bg-[#fce8e8] border-[#f5c6c6]',
  amber: 'text-[#d9861c] bg-[#fdf0d4] border-[#f0d19a]',
  verde: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
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

export function calcularAlertasAutomaticos(edital: ArgusEdital): { severidade: ArgusAlerta['severidade']; mensagem: string }[] {
  const alertas: { severidade: ArgusAlerta['severidade']; mensagem: string }[] = [];
  if (edital.data_encerramento_proposta) {
    const dias = Math.ceil((new Date(edital.data_encerramento_proposta).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (dias >= 0 && dias <= 3 && ['candidato', 'acompanhando'].includes(edital.status_interesse)) {
      alertas.push({ severidade: 'vermelho', mensagem: `Encerramento da proposta em ${dias} dia(s) — ${fmtData(edital.data_encerramento_proposta)}` });
    } else if (dias > 3 && dias <= 7) {
      alertas.push({ severidade: 'amber', mensagem: `Encerramento da proposta em ${dias} dias` });
    }
  }
  return alertas;
}
