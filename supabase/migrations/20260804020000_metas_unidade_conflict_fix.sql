-- A migration anterior (20260803020000) usou COALESCE(mes::text, 'year') no indice unico
-- pra tratar a meta anual (mes = NULL) corretamente. O problema: o upsert do Supabase monta
-- "ON CONFLICT (unidade, ano, mes)" com nomes de coluna literais, e o Postgres nunca casa
-- isso com um indice de EXPRESSAO — resultado: "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" em todo salvamento.
--
-- Fix real: indice literal (sem expressao) usando NULLS NOT DISTINCT (Postgres 15+), que
-- faz duas linhas com mes = NULL colidirem como duplicata — resolve o problema original
-- (meta anual duplicando) SEM precisar de expressao, entao o onConflict literal funciona.
DROP INDEX IF EXISTS metas_unique_unidade_ano_mes;

CREATE UNIQUE INDEX IF NOT EXISTS metas_unique_unidade_ano_mes
  ON public.metas (unidade, ano, mes) NULLS NOT DISTINCT
  WHERE tipo = 'unidade';
