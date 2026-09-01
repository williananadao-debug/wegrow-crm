-- Fluxo de produção mais robusto: sub-etapas dentro de "Em produção" (corte, solda,
-- pintura, montagem — sequência fixa, não é MRP configurável por produto), prazo padrão
-- de fabricação por produto (pra previsão de entrega preencher sozinha quando a produção
-- nasce de uma venda) e uma linha do tempo por produção (status, etapa, comentário, foto).

ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS prazo_fabricacao_dias integer;

ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS etapa_fabricacao_idx integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pulse_producao_eventos (
  id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  producao_id  bigint      NOT NULL REFERENCES public.pulse_producoes(id) ON DELETE CASCADE,
  tipo         text        NOT NULL CHECK (tipo IN ('status', 'etapa', 'comentario', 'anexo')),
  texto        text,
  foto_url     text,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pulse_producao_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulse_producao_eventos_select_empresa" ON public.pulse_producao_eventos;
DROP POLICY IF EXISTS "pulse_producao_eventos_insert_empresa" ON public.pulse_producao_eventos;

CREATE POLICY "pulse_producao_eventos_select_empresa" ON public.pulse_producao_eventos
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.pulse_producoes p WHERE p.id = producao_id AND p.empresa_id = public.meu_empresa_id()));
CREATE POLICY "pulse_producao_eventos_insert_empresa" ON public.pulse_producao_eventos
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.pulse_producoes p WHERE p.id = producao_id AND p.empresa_id = public.meu_empresa_id()));

CREATE INDEX IF NOT EXISTS pulse_producao_eventos_producao_id_idx ON public.pulse_producao_eventos(producao_id);

GRANT SELECT, INSERT ON public.pulse_producao_eventos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
