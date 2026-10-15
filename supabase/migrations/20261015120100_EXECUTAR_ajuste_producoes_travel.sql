-- EXECUTAR — rode só depois de conferir o PREVIEW (20261015120000).
-- Trailer Travel, 15/10/2026: apaga as produções duplicadas e volta o LD-3480 pra "Em produção".

BEGIN;

-- 1) Apaga as duplicadas (só se forem da Trailer Travel).
DELETE FROM public.pulse_producoes p
USING public.empresas e
WHERE e.id = p.empresa_id
  AND regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
  AND p.id IN (37, 38, 42, 51, 54);

-- 2) LD-3480: sai de "Entregue" e volta pra "Em produção", na etapa em que estava (a etapa
--    não muda). Fica registrado no histórico da produção.
WITH voltou AS (
  UPDATE public.pulse_producoes p
  SET status = 'em_producao'
  FROM public.empresas e
  WHERE e.id = p.empresa_id
    AND regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
    AND p.lead_id = 3480
    AND p.status = 'entregue'
  RETURNING p.id
)
INSERT INTO public.pulse_producao_eventos (producao_id, tipo, texto)
SELECT id, 'status', 'Voltou de "Entregue" para "Em produção" (marcado como entregue por engano).'
FROM voltou;

-- Conferência
SELECT id, produto_final_nome, cliente_avulso, lead_id, status, etapa_fabricacao_idx
FROM public.pulse_producoes
WHERE id IN (37, 38, 42, 51, 54) OR lead_id = 3480;

COMMIT;
