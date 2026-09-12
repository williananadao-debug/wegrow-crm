-- Backfill pontual — Demais FM (empresa_id 11111111-1111-1111-1111-111111111111).
--
-- Corrigido em 2026-09-11 (commit 0047a3b): salvarLead em src/app/deals/page.tsx só
-- gravava CNPJ/IE/endereço/telefone/cidade em `clientes` quando o cliente era NOVO.
-- Cliente já existente — esse dado ficava só no negócio, nunca voltava pro cadastro.
-- O fix vale só daqui pra frente; isso aqui é o catch-up pro que já ficou vazio antes.
--
-- Pra cada cliente da Demais FM, busca em `leads` o valor mais recente e não vazio de
-- cada campo (cada campo é resolvido separadamente — se o negócio mais recente tem CNPJ
-- mas não tem endereço, ainda pega o endereço de um negócio mais antigo que tinha). Só
-- preenche o que já está NULL no cadastro — nunca sobrescreve dado que já existe lá.
--
-- ⚠️ STATUS (2026-09-11, fim do dia): RODADO, MAS COM BUG — NÃO CONFIAR NO RESULTADO.
-- O BLOCO 2 rodou sem erro (sem_cnpj/sem_endereco/etc ficaram em 109/1886/1891/528/119,
-- iguais ao BLOCO 1), mas confirmamos manualmente que existem clientes que DEVERIAM ter
-- sido preenchidos e continuam NULL (ex: id 11318 "Comercio de motosserras presidente" —
-- tem CNPJ 24.504.633/0001-03 no negócio, `clientes.cnpj` continua NULL). O UPDATE não
-- está pegando todo mundo que a query de leitura (mesma lógica) encontra — bug real na
-- junção/CTE, ainda não identificado. NÃO rodar de novo sem antes achar a causa — rodar
-- de novo sem entender não vai piorar nada (é idempotente, só preenche NULL), mas também
-- não vai resolver sozinho.
-- Pausado a pedido do Will — o bug em si (dado não salvando pra negócio NOVO) já está
-- corrigido e confirmado (commit 0047a3b); isso aqui é só limpeza de histórico, sem
-- pressa. Retomar quando sobrar tempo: comparar client_id 11318 passo a passo contra o
-- que a CTE `cnpj_recente` do BLOCO 2 realmente devolve pra ele.

-- ============================================================================
-- BLOCO 1 — inventário (só leitura, roda primeiro)
-- ============================================================================
WITH alvo_clientes AS (
  SELECT id FROM public.clientes WHERE empresa_id = '11111111-1111-1111-1111-111111111111'
)
SELECT
  count(*) FILTER (WHERE c.cnpj IS NULL) AS sem_cnpj,
  count(*) FILTER (WHERE c.endereco IS NULL) AS sem_endereco,
  count(*) FILTER (WHERE c.inscricao_estadual IS NULL) AS sem_ie,
  count(*) FILTER (WHERE c.telefone IS NULL) AS sem_telefone,
  count(*) FILTER (WHERE c.cidade IS NULL) AS sem_cidade,
  count(*) AS total_clientes
FROM public.clientes c
JOIN alvo_clientes a ON a.id = c.id;

-- ============================================================================
-- BLOCO 2 — backfill (roda tudo de uma vez, dentro de transação)
-- ============================================================================
BEGIN;

WITH alvo_clientes AS (
  SELECT id FROM public.clientes WHERE empresa_id = '11111111-1111-1111-1111-111111111111'
),
cnpj_recente AS (
  SELECT DISTINCT ON (client_id) client_id, cnpj
  FROM public.leads
  WHERE empresa_id = '11111111-1111-1111-1111-111111111111' AND client_id IN (SELECT id FROM alvo_clientes)
    AND cnpj IS NOT NULL AND cnpj <> ''
  ORDER BY client_id, created_at DESC
),
ie_recente AS (
  SELECT DISTINCT ON (client_id) client_id, inscricao_estadual
  FROM public.leads
  WHERE empresa_id = '11111111-1111-1111-1111-111111111111' AND client_id IN (SELECT id FROM alvo_clientes)
    AND inscricao_estadual IS NOT NULL AND inscricao_estadual <> ''
  ORDER BY client_id, created_at DESC
),
endereco_recente AS (
  SELECT DISTINCT ON (client_id) client_id, endereco
  FROM public.leads
  WHERE empresa_id = '11111111-1111-1111-1111-111111111111' AND client_id IN (SELECT id FROM alvo_clientes)
    AND endereco IS NOT NULL AND endereco <> ''
  ORDER BY client_id, created_at DESC
),
telefone_recente AS (
  SELECT DISTINCT ON (client_id) client_id, telefone
  FROM public.leads
  WHERE empresa_id = '11111111-1111-1111-1111-111111111111' AND client_id IN (SELECT id FROM alvo_clientes)
    AND telefone IS NOT NULL AND telefone <> ''
  ORDER BY client_id, created_at DESC
),
cidade_recente AS (
  SELECT DISTINCT ON (client_id) client_id, cidade
  FROM public.leads
  WHERE empresa_id = '11111111-1111-1111-1111-111111111111' AND client_id IN (SELECT id FROM alvo_clientes)
    AND cidade IS NOT NULL AND cidade <> ''
  ORDER BY client_id, created_at DESC
)
UPDATE public.clientes c
SET
  cnpj = COALESCE(c.cnpj, cn.cnpj),
  inscricao_estadual = COALESCE(c.inscricao_estadual, ie.inscricao_estadual),
  endereco = COALESCE(c.endereco, en.endereco),
  telefone = COALESCE(c.telefone, tl.telefone),
  cidade = COALESCE(c.cidade, ci.cidade)
FROM alvo_clientes a
LEFT JOIN cnpj_recente cn ON cn.client_id = a.id
LEFT JOIN ie_recente ie ON ie.client_id = a.id
LEFT JOIN endereco_recente en ON en.client_id = a.id
LEFT JOIN telefone_recente tl ON tl.client_id = a.id
LEFT JOIN cidade_recente ci ON ci.client_id = a.id
WHERE c.id = a.id
  AND (cn.cnpj IS NOT NULL OR ie.inscricao_estadual IS NOT NULL OR en.endereco IS NOT NULL OR tl.telefone IS NOT NULL OR ci.cidade IS NOT NULL);

-- Confere — os números devem ter caído em relação ao BLOCO 1 (não necessariamente pra
-- zero: cliente que nunca teve negócio nenhum com esse dado preenchido continua vazio,
-- não tem de onde puxar)
WITH alvo_clientes AS (
  SELECT id FROM public.clientes WHERE empresa_id = '11111111-1111-1111-1111-111111111111'
)
SELECT
  count(*) FILTER (WHERE c.cnpj IS NULL) AS sem_cnpj,
  count(*) FILTER (WHERE c.endereco IS NULL) AS sem_endereco,
  count(*) FILTER (WHERE c.inscricao_estadual IS NULL) AS sem_ie,
  count(*) FILTER (WHERE c.telefone IS NULL) AS sem_telefone,
  count(*) FILTER (WHERE c.cidade IS NULL) AS sem_cidade,
  count(*) AS total_clientes
FROM public.clientes c
JOIN alvo_clientes a ON a.id = c.id;

COMMIT;
