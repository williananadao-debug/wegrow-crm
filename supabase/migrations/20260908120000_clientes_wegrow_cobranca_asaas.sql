-- Rastreamento da cobrança real via Asaas (boleto/Pix) que a WeGrow emite pros PRÓPRIOS
-- clientes (ex: mensalidade da Trailer Travel) — diferente de /api/financeiro/cobranca,
-- que é o tenant cobrando OS CLIENTES DELE. Guardado em clientes_wegrow porque é dado
-- interno da WeGrow sobre a relação com aquele cliente, não dado do tenant.
ALTER TABLE public.clientes_wegrow
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS ultima_cobranca_id text,
  ADD COLUMN IF NOT EXISTS ultima_cobranca_tipo text,
  ADD COLUMN IF NOT EXISTS ultima_cobranca_url text,
  ADD COLUMN IF NOT EXISTS ultima_cobranca_status text,
  ADD COLUMN IF NOT EXISTS ultima_cobranca_em timestamptz;
