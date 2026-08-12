-- O índice único de argus_editais(empresa_id, numero_controle_pncp) era PARCIAL
-- (WHERE numero_controle_pncp IS NOT NULL) — mesmo problema já visto e resolvido
-- em metas_unique_unidade_ano_mes (migration 20260804030000): o Postgres só
-- casa um "ON CONFLICT (colunas)" simples (o que o upsert do Supabase manda)
-- com um índice único LITERAL, sem WHERE. Resultado: todo upsert em
-- /api/argus/pncp/salvar falhava com "no unique or exclusion constraint
-- matching the ON CONFLICT specification" — silenciosamente, porque o
-- frontend não checava o erro (também corrigido agora).
--
-- Fix: índice sem WHERE. NULL nunca colide com NULL por padrão no Postgres,
-- então editais manuais (numero_controle_pncp = NULL) continuam livres pra
-- coexistir sem problema — esse índice só precisa mesmo dedupar os editais
-- de origem 'pncp', que sempre têm numero_controle_pncp preenchido.
DROP INDEX IF EXISTS argus_editais_numero_controle_pncp_empresa_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS argus_editais_numero_controle_pncp_empresa_uidx
  ON public.argus_editais(empresa_id, numero_controle_pncp);
