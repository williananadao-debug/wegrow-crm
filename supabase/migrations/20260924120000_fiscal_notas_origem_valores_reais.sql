-- A constraint original só permitia 3 valores de origem, mas o código já usa 3 outros que
-- nunca foram incluídos aqui — qualquer emissão de NF pelo Pulse (emitir-nf1/nf2,
-- origem 'emissao_wegrow'), a confirmação de emissão vinda do Focus NFe
-- (webhooks/focus-nfe/emitida, 'focus_nfe_emitida') e o backfill de saída
-- (focusNfeBackupSaida.ts, 'backup_focus_nfe') sempre violaram essa constraint — bug
-- pré-existente, não é regressão de hoje. Descoberto ao tentar "Emitir NF" numa venda Pulse.
ALTER TABLE public.fiscal_notas DROP CONSTRAINT IF EXISTS fiscal_notas_origem_check;
ALTER TABLE public.fiscal_notas ADD CONSTRAINT fiscal_notas_origem_check
  CHECK (origem IN (
    'manifestacao_focus_nfe', 'emissao_focus_nfe', 'manual',
    'emissao_wegrow', 'focus_nfe_emitida', 'backup_focus_nfe'
  ));
