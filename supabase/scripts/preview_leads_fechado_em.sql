-- SÓ LEITURA — conferência antes de rodar 20261006100000_leads_fechado_em.sql.
-- Mostra, por empresa, quantos leads ganhos vão mudar de mês (criado num mês, fechado em
-- outro, segundo o histórico de etapas) e quanto de faturamento muda de lugar.

WITH ultima_etapa AS (
  SELECT l.id, max((a->>'created_at')::timestamptz) AS dt
  FROM public.leads l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(to_jsonb(l.atividades)) = 'array' THEN to_jsonb(l.atividades) ELSE '[]'::jsonb END
  ) AS a
  WHERE l.status = 'ganho'
    AND a->>'tipo' = 'etapa'
    AND a->>'created_at' ~ '^\d{4}-\d{2}-\d{2}'
  GROUP BY l.id
),
calc AS (
  SELECT l.id, l.empresa_id, l.empresa, l.valor_total, l.created_at,
         GREATEST(u.dt, l.created_at) AS fechado_previsto
  FROM public.leads l
  LEFT JOIN ultima_etapa u ON u.id = l.id
  WHERE l.status = 'ganho'
)
SELECT e.nome AS empresa,
       count(*) AS ganhos,
       count(*) FILTER (WHERE c.fechado_previsto IS NULL) AS sem_historico_fica_na_criacao,
       count(*) FILTER (WHERE date_trunc('month', c.fechado_previsto AT TIME ZONE 'America/Sao_Paulo')
                             <> date_trunc('month', c.created_at AT TIME ZONE 'America/Sao_Paulo')) AS mudam_de_mes,
       sum(c.valor_total) FILTER (WHERE date_trunc('month', c.fechado_previsto AT TIME ZONE 'America/Sao_Paulo')
                                       <> date_trunc('month', c.created_at AT TIME ZONE 'America/Sao_Paulo')) AS valor_que_muda_de_mes
FROM calc c
JOIN public.empresas e ON e.id = c.empresa_id
GROUP BY e.nome
ORDER BY mudam_de_mes DESC NULLS LAST;

-- Detalhe da Demais FM (os que mudam de mês):
-- SELECT c.id, c.empresa, c.valor_total,
--        to_char(c.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS criado,
--        to_char(c.fechado_previsto AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS ganho
-- FROM calc c JOIN public.empresas e ON e.id = c.empresa_id
-- WHERE e.nome ILIKE '%demais%'
--   AND date_trunc('month', c.fechado_previsto) <> date_trunc('month', c.created_at)
-- ORDER BY c.fechado_previsto DESC;
