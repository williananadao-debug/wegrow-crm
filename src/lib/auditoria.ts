// Registro de quem fez o quê (tabela auditoria). Nunca derruba a ação principal: se a gravação
// falhar (ex.: migration 20261102120000 ainda não rodou), só loga no console.
import { SupabaseClient } from '@supabase/supabase-js';

export type AcaoAuditoria =
  | 'suporte.entrar_como' | 'senha.gerar' | 'empresa.criar' | 'empresa.alterar'
  | 'cobranca.assinatura' | 'cobranca.cancelar_assinatura' | 'cobranca.liberar_acesso' | 'cobranca.regras'
  | 'parceiro.alterar' | 'parceiro.logo_marca' | 'parceiro.usuarios';

export async function registrarAuditoria(db: SupabaseClient, r: {
  ator: string | null | undefined;
  tipo?: 'wegrow' | 'parceiro' | 'sistema';
  acao: AcaoAuditoria;
  empresaId?: string | null;
  parceiroId?: string | null;
  detalhe?: Record<string, unknown>;
}) {
  try {
    const { error } = await db.from('auditoria').insert({
      ator_email: r.ator || null,
      ator_tipo: r.tipo || 'wegrow',
      acao: r.acao,
      empresa_id: r.empresaId || null,
      parceiro_id: r.parceiroId || null,
      detalhe: r.detalhe || null,
    });
    if (error) console.error('[auditoria]', r.acao, error.message);
  } catch (err) {
    console.error('[auditoria]', r.acao, err);
  }
}
