-- Add unidade column to metas for unit-level (per-station) goals
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS metas_unique_unidade_ano_mes
  ON public.metas (unidade, ano, mes)
  WHERE tipo = 'unidade';
