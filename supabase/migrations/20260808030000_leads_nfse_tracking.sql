-- Guarda o resultado da emissão de NFS-e no próprio lead, pra saber se já foi emitida
-- (evita emitir 2x) e linkar direto pro PDF na lista de vendas do Pulse.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS nfse_invoice_id text,
  ADD COLUMN IF NOT EXISTS nfse_pdf_url text,
  ADD COLUMN IF NOT EXISTS nfse_emitida_em timestamptz;
