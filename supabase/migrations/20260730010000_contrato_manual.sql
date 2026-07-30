-- Upload manual do contrato já assinado (fluxo sem assinatura eletrônica)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contrato_manual_url TEXT DEFAULT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contrato_manual_em TIMESTAMPTZ DEFAULT NULL;
