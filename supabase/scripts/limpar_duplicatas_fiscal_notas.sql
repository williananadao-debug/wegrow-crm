-- A primeira versão do backfill tinha um bug: a API do Focus NFe devolve uma linha por
-- EVENTO (não por nota), e a mesma chave_acesso aparecia várias vezes (ex: uma vez com
-- XML ainda não pronto, outra vez já pronto). Sem dedupe na origem, cada nota podia virar
-- 2+ linhas duplicadas em fiscal_notas. Corrigido no código (listarNfesRecebidas agora
-- dedupe por chave, mantendo só o evento mais recente) — mas o que já foi criado no banco
-- antes do fix continua duplicado até rodar isso aqui.
--
-- Mantém, por chave_acesso, a linha "melhor": a que já tem item lido (itens_status !=
-- 'sem_itens') se existir, senão a mais recente (maior id). Apaga o resto.

-- BLOCO 1 — inventário (só leitura, roda primeiro)
WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%'),
duplicadas AS (
  SELECT chave_acesso, count(*) AS qtd
  FROM public.fiscal_notas
  WHERE empresa_id IN (SELECT id FROM alvo) AND chave_acesso IS NOT NULL
  GROUP BY chave_acesso HAVING count(*) > 1
)
SELECT count(*) AS chaves_duplicadas, sum(qtd) AS linhas_totais, sum(qtd) - count(*) AS linhas_a_apagar
FROM duplicadas;

-- BLOCO 2 — limpeza (roda dentro de transação)
-- BEGIN;
--
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%'),
-- ranked AS (
--   SELECT id, chave_acesso,
--     row_number() OVER (
--       PARTITION BY chave_acesso
--       ORDER BY (itens_status <> 'sem_itens') DESC, id DESC
--     ) AS rn
--   FROM public.fiscal_notas
--   WHERE empresa_id IN (SELECT id FROM alvo) AND chave_acesso IS NOT NULL
-- )
-- DELETE FROM public.fiscal_notas WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--
-- -- Confere que sumiu (roda o BLOCO 1 de novo aqui dentro — tem que vir tudo zero)
-- -- COMMIT;   -- ou ROLLBACK; se vier diferente do esperado
