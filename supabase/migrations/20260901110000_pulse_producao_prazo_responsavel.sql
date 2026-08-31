-- Previsão de entrega e responsável pela produção — faltava dar visibilidade de prazo
-- e de quem está tocando cada ordem de produção.
ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS previsao_entrega date;
ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
