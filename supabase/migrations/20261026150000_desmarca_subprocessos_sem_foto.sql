-- Sub-processos marcados ANTES da foto virar obrigatória (26/10/2026) ficaram validados sem foto.
-- Aqui eles voltam a ficar pendentes, pra fábrica refazer com a foto. Só produções em andamento.
-- A etapa em si não volta sozinha: quem precisa refazer uma etapa já concluída usa o botão
-- "Voltar etapa" na produção (liberado pra todos).
-- Pode rodar de novo: na 2ª vez não acha mais nada sem foto.

-- 1) Conferência: o que vai ser desmarcado.
SELECT p.id, coalesce(p.cliente_avulso, 'LD-' || lpad(p.lead_id::text, 4, '0')) AS projeto,
       e.key AS etapa, i.key AS sub_processo, i.value->>'em' AS marcado_em
FROM public.pulse_producoes p,
     jsonb_each(coalesce(p.checklist_feito, '{}'::jsonb)) e,
     jsonb_each(e.value) i
WHERE p.status = 'em_producao'
  AND coalesce(i.value->>'foto', '') = ''
ORDER BY p.id, e.key;

-- 2) Desmarca (mantém só os itens que têm foto).
UPDATE public.pulse_producoes p
SET checklist_feito = (
  SELECT coalesce(jsonb_object_agg(e.key, (
           SELECT coalesce(jsonb_object_agg(i.key, i.value), '{}'::jsonb)
           FROM jsonb_each(e.value) i
           WHERE coalesce(i.value->>'foto', '') <> ''
         )), '{}'::jsonb)
  FROM jsonb_each(p.checklist_feito) e
)
WHERE p.status = 'em_producao'
  AND p.checklist_feito IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_each(p.checklist_feito) e, jsonb_each(e.value) i
    WHERE coalesce(i.value->>'foto', '') = ''
  );
