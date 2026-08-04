-- Causa raiz definitiva dos erros de "meta por unidade": existia uma constraint antiga
-- (bem anterior as migrations rastreadas aqui, criada direto no Studio) chamada
-- "metas_periodo_unico" = UNIQUE NULLS NOT DISTINCT (user_id, ano, mes), valida pra
-- TABELA INTEIRA. Ela nao sabe nada sobre produto/unidade, entao qualquer 2 linhas com o
-- mesmo user_id (inclusive NULL) + ano + mes colidem — mesmo sendo unidades ou produtos
-- diferentes. Por isso salvar a 2a unidade do mesmo mes quebrava.
--
-- As tentativas anteriores (indices separados com COALESCE, NULLS NOT DISTINCT parcial)
-- nao adiantaram porque essa constraint mais antiga continuava batendo primeiro.
--
-- Fix definitivo: amplia a propria "metas_periodo_unico" pra incluir produto e unidade
-- como diferenciadores, mantendo NULLS NOT DISTINCT (mesmo mecanismo que ja fazia a meta
-- anual do vendedor funcionar corretamente ha meses). Isso tambem corrige de brinde o
-- mesmo problema que provavelmente ja afetava salvar 2+ metas de produto no mesmo mes.
ALTER TABLE public.metas DROP CONSTRAINT IF EXISTS metas_periodo_unico;
ALTER TABLE public.metas ADD CONSTRAINT metas_periodo_unico
  UNIQUE NULLS NOT DISTINCT (user_id, ano, mes, produto, unidade);

-- Indices/expressoes anteriores ficam redundantes (nunca funcionavam como alvo de
-- onConflict de qualquer forma, por serem parciais ou por expressao).
DROP INDEX IF EXISTS metas_unique_unidade_ano_mes;
DROP INDEX IF EXISTS metas_unique_user_ano_mes_produto;
