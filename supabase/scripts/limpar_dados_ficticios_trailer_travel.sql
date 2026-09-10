-- Limpeza dos dados fictícios usados na demo/implantação da Trailer Travel.
--
-- NÃO é migration: é script de operação, roda na mão no SQL Editor do Supabase.
-- Migration roda sozinha em todo deploy e apagaria dado de novo — aqui a intenção é
-- rodar UMA vez, quando a empresa vai começar a operar de verdade.
--
-- Como usar:
--   1. Rode o BLOCO 1 (inventário) e confira os números — é ele que diz o que existe.
--   2. Confira que nada ali é dado real que a empresa já lançou.
--   3. Descomente no BLOCO 3 só as tabelas que você quer zerar e rode.
--
-- A ordem dos DELETEs respeita as FKs: pulse_producao_itens, pulse_producao_eventos e
-- pulse_aditivos.producao_id são ON DELETE CASCADE a partir de pulse_producoes, então
-- apagar a produção já leva os filhos junto. estoque_movimentacoes.producao_id é
-- ON DELETE SET NULL, por isso o kardex é apagado explicitamente antes.

-- ============================================================================
-- BLOCO 1 — INVENTÁRIO (só leitura, rode isso primeiro)
-- ============================================================================
WITH alvo AS (
  SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%'
)
SELECT 'empresas'                AS tabela, count(*) FROM public.empresas WHERE id IN (SELECT id FROM alvo)
UNION ALL SELECT 'fiscal_notas',           count(*) FROM public.fiscal_notas           WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'estoque_movimentacoes',  count(*) FROM public.estoque_movimentacoes  WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'pulse_producoes',        count(*) FROM public.pulse_producoes        WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'pulse_aditivos',         count(*) FROM public.pulse_aditivos         WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'pulse_fichas_tecnicas',  count(*) FROM public.pulse_fichas_tecnicas  WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'servicos (produtos)',    count(*) FROM public.servicos               WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'leads (vendas)',         count(*) FROM public.leads                  WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'clientes',               count(*) FROM public.clientes               WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'lancamentos',            count(*) FROM public.lancamentos            WHERE empresa_id IN (SELECT id FROM alvo)
UNION ALL SELECT 'visitas',                count(*) FROM public.visitas                WHERE empresa_id IN (SELECT id FROM alvo)
ORDER BY 1;

-- Confere que o ILIKE pegou UMA empresa só (e a certa) antes de apagar qualquer coisa:
-- SELECT id, nome FROM public.empresas WHERE nome ILIKE '%trailer%travel%';

-- ============================================================================
-- BLOCO 2 — o que costuma ser fictício e o que NÃO deve ser apagado
-- ============================================================================
-- Fictício (dado de movimento criado só pra demonstrar a tela):
--   fiscal_notas, estoque_movimentacoes, pulse_producoes (+ itens/eventos/aditivos),
--   leads, lancamentos, visitas
--
-- CUIDADO — costuma ser configuração real, não demo:
--   servicos (catálogo de produtos/insumos), pulse_fichas_tecnicas (ficha técnica de
--   cada modelo), clientes (cadastro que a empresa já usa), profiles (usuários).
--   Apagar servicos quebra as fichas técnicas e o histórico que sobrar. Se o catálogo
--   for de teste mesmo, apague DEPOIS de zerar estoque_movimentacoes e producoes.

-- ============================================================================
-- BLOCO 3 — LIMPEZA (descomente linha a linha, roda dentro de transação)
-- ============================================================================
-- BEGIN;
--
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- DELETE FROM public.fiscal_notas          WHERE empresa_id IN (SELECT id FROM alvo);
--
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- DELETE FROM public.estoque_movimentacoes WHERE empresa_id IN (SELECT id FROM alvo);
--
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- DELETE FROM public.pulse_aditivos        WHERE empresa_id IN (SELECT id FROM alvo);
--
-- -- leva pulse_producao_itens e pulse_producao_eventos junto (CASCADE)
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- DELETE FROM public.pulse_producoes       WHERE empresa_id IN (SELECT id FROM alvo);
--
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- DELETE FROM public.leads                 WHERE empresa_id IN (SELECT id FROM alvo);
--
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- DELETE FROM public.lancamentos           WHERE empresa_id IN (SELECT id FROM alvo);
--
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- DELETE FROM public.visitas               WHERE empresa_id IN (SELECT id FROM alvo);
--
-- -- Saldo de estoque vive em servicos.estoque; zerar o kardex sem zerar o saldo deixa
-- -- "10 chapas em estoque" sem nenhuma movimentação que explique de onde vieram.
-- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- UPDATE public.servicos SET estoque = 0 WHERE empresa_id IN (SELECT id FROM alvo) AND estoque IS NOT NULL;
--
-- -- Só se o catálogo também for de teste (apaga ficha técnica junto, na ordem certa):
-- -- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- -- DELETE FROM public.pulse_fichas_tecnicas WHERE empresa_id IN (SELECT id FROM alvo);
-- -- WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
-- -- DELETE FROM public.servicos              WHERE empresa_id IN (SELECT id FROM alvo);
--
-- -- Rode o BLOCO 1 de novo aqui dentro pra conferir os zeros ANTES de confirmar.
-- -- COMMIT;   -- ou ROLLBACK; se algum número vier diferente do esperado
