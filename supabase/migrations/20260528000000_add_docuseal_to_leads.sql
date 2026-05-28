-- Colunas para integração Docuseal (assinatura eletrônica)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS docuseal_submission_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS docuseal_sign_url text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS docuseal_assinado boolean DEFAULT false;
