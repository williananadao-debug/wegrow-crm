-- Data de fechamento do lead (ganho/perdido).
--
-- Antes, todo relatório/meta/dashboard colocava a venda no mês em que o lead foi CRIADO:
-- lead aberto em setembro e ganho em outubro aparecia como venda de setembro (relatado
-- pela Demais FM). fechado_em guarda quando o lead virou ganho/perdido, e as telas passam
-- a usar essa data pra ganho/perdido (lead aberto continua pela data de criação).
--
-- RODAR ANTES DO DEPLOY do código que lê fechado_em.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS fechado_em timestamptz;

-- ── Backfill ─────────────────────────────────────────────────────────────────────
-- 1) Melhor fonte: a última mudança de etapa registrada no histórico do próprio lead
--    (atividades[].tipo = 'etapa' — gravada pelo Pipeline ao mover pra Ganhos/Perdidos).
--    Como o lead está hoje em ganho/perdido, a última mudança de etapa é a do fechamento.
WITH ultima_etapa AS (
  SELECT l.id, max((a->>'created_at')::timestamptz) AS dt
  FROM public.leads l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(to_jsonb(l.atividades)) = 'array' THEN to_jsonb(l.atividades) ELSE '[]'::jsonb END
  ) AS a
  WHERE l.status IN ('ganho', 'perdido')
    AND l.fechado_em IS NULL
    AND a->>'tipo' = 'etapa'
    AND a->>'created_at' ~ '^\d{4}-\d{2}-\d{2}'
  GROUP BY l.id
)
UPDATE public.leads l
SET fechado_em = GREATEST(u.dt, l.created_at)
FROM ultima_etapa u
WHERE u.id = l.id;

-- 2) Sem histórico (venda direta do Pulse, importações, leads antigos): estorno usa a data
--    do estorno; o resto fica com a data de criação — mesmo comportamento de antes.
UPDATE public.leads
SET fechado_em = COALESCE(estornado_em, created_at)
WHERE status IN ('ganho', 'perdido') AND fechado_em IS NULL;

-- ── Trigger: mantém fechado_em sozinho, venha a mudança de onde vier ─────────────
-- (Pipeline, Pulse convertendo orçamento, filiação CDL, API, importação...)
CREATE OR REPLACE FUNCTION public.leads_set_fechado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('ganho', 'perdido') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.fechado_em := COALESCE(NEW.fechado_em, now());
    ELSIF OLD.status IS DISTINCT FROM NEW.status
          AND NEW.fechado_em IS NOT DISTINCT FROM OLD.fechado_em THEN
      -- Mudou pra ganho/perdido agora (e ninguém informou a data explicitamente).
      NEW.fechado_em := now();
    END IF;
  ELSE
    -- Voltou pra aberto/orçamento: deixa de ter data de fechamento.
    NEW.fechado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_fechado_em ON public.leads;
CREATE TRIGGER trg_leads_fechado_em
  BEFORE INSERT OR UPDATE OF status, fechado_em ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_set_fechado_em();

-- Filtros por período em dashboard/metas/relatórios.
CREATE INDEX IF NOT EXISTS leads_empresa_fechado_em_idx ON public.leads (empresa_id, fechado_em DESC);
