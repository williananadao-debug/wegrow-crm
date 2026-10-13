-- Início de etapa explícito: a produção (e cada etapa seguinte) começa "aguardando início" e a
-- fábrica clica em "Iniciar" — antes caía direto na 1ª etapa (ex.: Chassi) sem ninguém ter
-- começado. Enquanto etapa_iniciada_em for nulo, o card mostra há quantos dias está parado.
ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS etapa_iniciada_em timestamptz;
ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS etapa_iniciada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Produções que já estão em andamento continuam como "iniciadas" (desde a última conclusão de
-- etapa, ou desde a criação) — só as novas passam a esperar o clique em "Iniciar".
UPDATE public.pulse_producoes p
SET etapa_iniciada_em = coalesce(
  (SELECT max(e.created_at) FROM public.pulse_producao_eventos e WHERE e.producao_id = p.id AND e.tipo = 'etapa'),
  p.created_at
)
WHERE p.status = 'em_producao' AND p.etapa_iniciada_em IS NULL;
