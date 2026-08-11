-- Personalização de cadastro pedida pelo Willian: SKU/código de barras, preço de custo
-- (pra calcular margem) e estoque mínimo configurável por produto (antes era fixo em 5
-- unidades pra todo mundo, hardcoded em 3 telas diferentes).
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS preco_custo numeric;
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS estoque_minimo numeric NOT NULL DEFAULT 5;
