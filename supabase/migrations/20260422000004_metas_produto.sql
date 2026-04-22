-- Add produto column to metas for product-level goals
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS produto TEXT DEFAULT NULL;

-- Drop old unique constraint and recreate including produto
ALTER TABLE public.metas DROP CONSTRAINT IF EXISTS metas_user_id_ano_mes_key;
ALTER TABLE public.metas DROP CONSTRAINT IF EXISTS metas_unique_user_ano_mes;

CREATE UNIQUE INDEX IF NOT EXISTS metas_unique_user_ano_mes_produto
  ON public.metas (COALESCE(user_id::TEXT, 'global'), ano, COALESCE(mes::TEXT, 'year'), COALESCE(produto, 'faturamento'));
