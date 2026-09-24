-- Suporte ao botão manual "Cancelar contrato" (Pulse) — registra quando um contrato foi
-- cancelado/anulado pelo usuário, sem apagar o histórico de arquivos já assinados
-- (docuseal_arquivos continua intocado; só invalida a submissão ativa no Docuseal).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS docuseal_cancelado_em timestamptz;
