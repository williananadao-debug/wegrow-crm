-- O indice unico de metas por unidade (unidade, ano, mes) nao tratava a meta anual
-- (mes = NULL) corretamente: NULL nunca "bate" com NULL num indice unico comum do
-- Postgres, entao salvar a meta do ano mais de uma vez criava linhas duplicadas em
-- vez de atualizar (mesmo problema que os indices de user_id/produto ja resolviam
-- com COALESCE).
DROP INDEX IF EXISTS metas_unique_unidade_ano_mes;

CREATE UNIQUE INDEX IF NOT EXISTS metas_unique_unidade_ano_mes
  ON public.metas (unidade, ano, COALESCE(mes::TEXT, 'year'))
  WHERE tipo = 'unidade';
