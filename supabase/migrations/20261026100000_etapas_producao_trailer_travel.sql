-- Novo fluxo de produção da Trailer Travel (pedido de 26/10/2026). Os sub-processos de cada etapa
-- viram o checklist dela — a etapa só conclui com todos marcados:
--   Chassi     → Suspensão
--   Estrutura  → Pintura, Assoalho, Dupla face
--   ACM        → Vedação PU, Colocação de teto, Acabamentos em alumínio
--   Elétrica   → Passagem de fios, Colocação de lâmpadas, Colocação de tomadas
--   Marcenaria → Acabamentos, Piso, Móveis, Elétrica, Hidráulica
--
-- As produções guardam a etapa pelo ÍNDICE (etapa_fabricacao_idx), então a ordem nova deslocaria
-- quem já está em andamento. Aqui cada produção é reposicionada pelo NOME da etapa em que está:
-- Suspensão (antes etapa própria) cai em Chassi, Hidráulica cai em Marcenaria. Prazo em dias de
-- etapas com o mesmo nome é mantido. Pode rodar de novo: na 2ª vez os nomes já batem 1:1.

WITH emp AS (
  SELECT e.id, e.modulos
  FROM public.empresas e
  WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
),
antigas AS (
  SELECT (t.ord - 1)::int AS idx,
         coalesce(t.el->>'nome', t.el #>> '{}') AS nome,
         nullif(t.el->>'prazoDias', '')::numeric AS prazo
  FROM emp, jsonb_array_elements(coalesce(emp.modulos->'pulse_etapas_fabricacao', '[]'::jsonb)) WITH ORDINALITY AS t(el, ord)
),
novas(idx, nome, checklist) AS (VALUES
  (0, 'Chassi',     ARRAY['Suspensão']),
  (1, 'Estrutura',  ARRAY['Pintura', 'Assoalho', 'Dupla face']),
  (2, 'ACM',        ARRAY['Vedação PU', 'Colocação de teto', 'Acabamentos em alumínio']),
  (3, 'Elétrica',   ARRAY['Passagem de fios', 'Colocação de lâmpadas', 'Colocação de tomadas']),
  (4, 'Marcenaria', ARRAY['Acabamentos', 'Piso', 'Móveis', 'Elétrica', 'Hidráulica'])
),
remap AS (
  SELECT p.id,
         CASE
           WHEN a.nome ILIKE 'chassi%' OR a.nome ILIKE 'suspens%' THEN 0
           WHEN a.nome ILIKE 'estrutura%' OR a.nome ILIKE 'pintura%' THEN 1
           WHEN a.nome ILIKE 'acm%' THEN 2
           WHEN a.nome ILIKE 'el_trica%' THEN 3
           WHEN a.nome ILIKE 'marcenaria%' OR a.nome ILIKE 'hidr%' OR a.nome ILIKE 'acabamento%' THEN 4
           ELSE least(p.etapa_fabricacao_idx, 4)
         END AS novo_idx
  FROM public.pulse_producoes p
  JOIN emp ON emp.id = p.empresa_id
  LEFT JOIN antigas a ON a.idx = p.etapa_fabricacao_idx
  WHERE p.etapa_fabricacao_idx IS NOT NULL
),
upd_producoes AS (
  UPDATE public.pulse_producoes p
  SET etapa_fabricacao_idx = r.novo_idx
  FROM remap r
  WHERE p.id = r.id AND p.etapa_fabricacao_idx IS DISTINCT FROM r.novo_idx
  RETURNING p.id
)
UPDATE public.empresas e
SET modulos = jsonb_set(
  coalesce(e.modulos, '{}'::jsonb),
  '{pulse_etapas_fabricacao}',
  (SELECT jsonb_agg(jsonb_build_object(
            'nome', n.nome,
            'prazoDias', (SELECT a.prazo FROM antigas a WHERE a.nome ILIKE n.nome LIMIT 1),
            'checklist', to_jsonb(n.checklist)
          ) ORDER BY n.idx)
   FROM novas n)
)
FROM emp
WHERE e.id = emp.id;

-- Conferência: fluxo salvo e onde cada produção ficou.
SELECT t.ord AS ordem, t.el->>'nome' AS etapa, t.el->'checklist' AS sub_processos
FROM public.empresas e,
     jsonb_array_elements(e.modulos->'pulse_etapas_fabricacao') WITH ORDINALITY AS t(el, ord)
WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125';

SELECT p.cliente_avulso, p.produto_final_nome, p.status, p.etapa_fabricacao_idx,
       e.modulos->'pulse_etapas_fabricacao'->p.etapa_fabricacao_idx->>'nome' AS etapa
FROM public.pulse_producoes p
JOIN public.empresas e ON e.id = p.empresa_id
WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
  AND p.status NOT IN ('concluida', 'cancelada')
ORDER BY p.etapa_fabricacao_idx, p.previsao_entrega NULLS LAST;
