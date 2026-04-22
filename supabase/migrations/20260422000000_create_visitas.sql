-- ============================================================
-- TABELA: visitas (registro independente de leads)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visitas (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa       text        NOT NULL,
  telefone      text,
  observacao    text,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  empresa_id    uuid        NOT NULL,
  unidade       text,
  latitude      float8,
  longitude     float8,
  localizacao_url text,
  lead_id       bigint      REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visitas_select_empresa"  ON public.visitas;
DROP POLICY IF EXISTS "visitas_insert_empresa"  ON public.visitas;
DROP POLICY IF EXISTS "visitas_update_empresa"  ON public.visitas;
DROP POLICY IF EXISTS "visitas_delete_empresa"  ON public.visitas;

CREATE POLICY "visitas_select_empresa" ON public.visitas
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "visitas_insert_empresa" ON public.visitas
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "visitas_update_empresa" ON public.visitas
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id())
  WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "visitas_delete_empresa" ON public.visitas
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() = 'diretor' OR user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS visitas_empresa_id_idx ON public.visitas(empresa_id);
CREATE INDEX IF NOT EXISTS visitas_user_id_idx    ON public.visitas(user_id);
CREATE INDEX IF NOT EXISTS visitas_created_at_idx ON public.visitas(created_at DESC);
