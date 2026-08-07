-- Rastreia quais meses já tiveram cobrança recorrente gerada automaticamente
-- pra cada lead (evita cobrar duas vezes o mesmo mês). Formato:
-- [{"mes":"2026-09","asaas_payment_id":"pay_xxx","valor":497,"gerado_em":"...","invoiceUrl":"..."}]
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cobrancas_recorrentes jsonb NOT NULL DEFAULT '[]';
