-- As duas tentativas anteriores (COALESCE e NULLS NOT DISTINCT) tinham indice com
-- "WHERE tipo = 'unidade'" (indice PARCIAL). Postgres so usa um indice parcial como alvo
-- de ON CONFLICT se a propria clausula ON CONFLICT repetir o mesmo WHERE — e o upsert do
-- Supabase (onConflict como lista de colunas) nao tem como fazer isso. Por isso continuava
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Fix definitivo: indice UNICO SEM WHERE (nao parcial), literal (sem expressao), cobrindo
-- (unidade, ano, mes). Como "unidade" so e preenchido em linhas tipo='unidade' (fica NULL
-- nas demais), e NULL nunca colide com NULL por padrao, esse indice nao interfere nas metas
-- de vendedor/produto — elas simplesmente ficam fora do alcance dele. Mes usa 0 como
-- sentinela pra meta anual (em vez de NULL), pra nao precisar de NULLS NOT DISTINCT.
DROP INDEX IF EXISTS metas_unique_unidade_ano_mes;

CREATE UNIQUE INDEX IF NOT EXISTS metas_unique_unidade_ano_mes
  ON public.metas (unidade, ano, mes);

-- Meta anual por unidade que ja tinha sido salva com mes=NULL antes desse fix passa a usar
-- o sentinela 0 (senao ela fica "invisivel" pro novo indice/consulta do frontend).
UPDATE public.metas SET mes = 0 WHERE tipo = 'unidade' AND mes IS NULL;
