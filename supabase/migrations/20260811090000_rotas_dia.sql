-- ============================================================
-- ROTA DO DIA INTELIGENTE
-- rotas_dia: cabeçalho (um vendedor, um dia)
-- rotas_dia_paradas: os clientes a visitar naquele dia, com status de andamento
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rotas_dia (
  id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id   uuid        NOT NULL,
  vendedor_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data         date        NOT NULL,
  unidade      text,
  criado_por   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  status       text        NOT NULL DEFAULT 'ativa',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, vendedor_id, data)
);

CREATE TABLE IF NOT EXISTS public.rotas_dia_paradas (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  rota_id     bigint      NOT NULL REFERENCES public.rotas_dia(id) ON DELETE CASCADE,
  empresa_id  uuid        NOT NULL,
  vendedor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id  bigint      NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ordem       int         NOT NULL DEFAULT 0,
  status      text        NOT NULL DEFAULT 'pendente', -- pendente | visitada | pulada
  score       numeric,
  motivo      text,
  visita_id   bigint      REFERENCES public.visitas(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rota_id, cliente_id)
);

ALTER TABLE public.rotas_dia         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotas_dia_paradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rotas_dia_select" ON public.rotas_dia;
DROP POLICY IF EXISTS "rotas_dia_insert" ON public.rotas_dia;
DROP POLICY IF EXISTS "rotas_dia_update" ON public.rotas_dia;
DROP POLICY IF EXISTS "rotas_dia_delete" ON public.rotas_dia;

CREATE POLICY "rotas_dia_select" ON public.rotas_dia
  FOR SELECT USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR vendedor_id = auth.uid())
  );

-- Insert liberado pra diretor/gerente (fluxo principal, geração via função) e também pro
-- próprio vendedor (fallback: ele adiciona uma parada extra num dia em que ninguém gerou
-- rota pra ele ainda, precisa de um cabeçalho rotas_dia pra pendurar a parada)
CREATE POLICY "rotas_dia_insert" ON public.rotas_dia
  FOR INSERT WITH CHECK (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR vendedor_id = auth.uid())
  );

CREATE POLICY "rotas_dia_update" ON public.rotas_dia
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'))
  WITH CHECK (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

CREATE POLICY "rotas_dia_delete" ON public.rotas_dia
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() IN ('diretor','gerente')
  );

DROP POLICY IF EXISTS "rotas_dia_paradas_select" ON public.rotas_dia_paradas;
DROP POLICY IF EXISTS "rotas_dia_paradas_insert" ON public.rotas_dia_paradas;
DROP POLICY IF EXISTS "rotas_dia_paradas_update" ON public.rotas_dia_paradas;
DROP POLICY IF EXISTS "rotas_dia_paradas_delete" ON public.rotas_dia_paradas;

CREATE POLICY "rotas_dia_paradas_select" ON public.rotas_dia_paradas
  FOR SELECT USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR vendedor_id = auth.uid())
  );

-- Insert liberado pra diretor/gerente (geração via função) e também pro próprio vendedor
-- (parada extra que ele adiciona manualmente na própria rota)
CREATE POLICY "rotas_dia_paradas_insert" ON public.rotas_dia_paradas
  FOR INSERT WITH CHECK (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR vendedor_id = auth.uid())
  );

-- Update liberado pra diretor/gerente e pro próprio vendedor (marcar visitada/pulada)
CREATE POLICY "rotas_dia_paradas_update" ON public.rotas_dia_paradas
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id() AND (public.meu_cargo() IN ('diretor','gerente') OR vendedor_id = auth.uid()))
  WITH CHECK (empresa_id = public.meu_empresa_id() AND (public.meu_cargo() IN ('diretor','gerente') OR vendedor_id = auth.uid()));

-- Delete liberado pra diretor/gerente e pro próprio vendedor (só remove parada dele mesmo,
-- mesmo nível de controle que ele já tem sobre as próprias visitas)
CREATE POLICY "rotas_dia_paradas_delete" ON public.rotas_dia_paradas
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR vendedor_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rotas_dia, public.rotas_dia_paradas TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS rotas_dia_vendedor_data_idx ON public.rotas_dia(vendedor_id, data);
CREATE INDEX IF NOT EXISTS rotas_dia_paradas_rota_idx  ON public.rotas_dia_paradas(rota_id);
CREATE INDEX IF NOT EXISTS rotas_dia_paradas_status_idx ON public.rotas_dia_paradas(empresa_id, status);

-- Habilita realtime (progresso ao vivo pro diretor/gerente e pro próprio vendedor)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rotas_dia_paradas;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
