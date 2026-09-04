export type Billing = {
  empresa_id: string;
  valor_mensal: number;
  proximo_vencimento: string | null;
  whatsapp: string | null;
  contato: string | null;
  observacao: string | null;
  razao_social?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  contrato_template_id?: string | null;
  contrato_edit_url?: string | null;
  contrato_submission_id?: string | null;
  contrato_arquivo_path?: string | null;
  contrato_status?: string | null; // rascunho | gerado | enviado | assinado
  contrato_fidelidade_meses?: number | null;
  contrato_signer_nome?: string | null;
  contrato_signer_email?: string | null;
  contrato_sign_url?: string | null;
  contrato_enviado_em?: string | null;
  contrato_assinado_em?: string | null;
  cronograma_arquivo_path?: string | null;
  cronograma_status?: string | null; // rascunho | gerado | enviado | assinado
  cronograma_signer_nome?: string | null;
  cronograma_signer_email?: string | null;
  cronograma_sign_url?: string | null;
  cronograma_enviado_em?: string | null;
  cronograma_assinado_em?: string | null;
};

export type Empresa = {
  id: string;
  nome: string;
  cnpj?: string;
  plano: string;
  status: string;
  modulos: Record<string, any>;
  created_at: string;
  total_usuarios?: number;
  logo_url?: string | null;
  cor_primaria?: string | null;
  canal_origem?: string | null;
  cancelado_em?: string | null;
  billing: Billing | null;
};

export type AbaProps = {
  empresa: Empresa;
  token: string;
  onAtualizado: () => void;
};

export const headersAuth = (token: string) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });

export function diasParaVencer(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000);
}

export function fmtData(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

export function proximoMes(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  dt.setMonth(dt.getMonth() + 1);
  return dt.toISOString().substring(0, 10);
}

export function statusPgto(b: Billing | null): 'sem_dados' | 'ativo' | 'vencendo' | 'inadimplente' {
  if (!b || !b.proximo_vencimento) return 'sem_dados';
  const dias = diasParaVencer(b.proximo_vencimento);
  if (dias === null) return 'sem_dados';
  if (dias < 0) return 'inadimplente';
  if (dias <= 7) return 'vencendo';
  return 'ativo';
}

export const BILLING_VAZIO = (empresa_id: string): Billing => ({
  empresa_id, valor_mensal: 0, proximo_vencimento: null, whatsapp: null, contato: null, observacao: null,
});
