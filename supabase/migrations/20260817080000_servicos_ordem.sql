-- Permite o cliente arrastar os produtos na tela de cadastro (/settings) pra organizar
-- a ordem de exibição do catálogo. Nulo = ainda não reordenado manualmente (cai no fim,
-- ordenado por id como sempre foi).
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS ordem integer;
