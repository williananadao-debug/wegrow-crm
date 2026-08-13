-- Audiência estimada por praça (uma linha por emissora/mês), separando o card "Rede
-- em cadeia" que hoje só existe agregado. Instagram/Facebook por praça fica pra depois —
-- midia_meta_config hoje é uma conta só por empresa, não por praça.
CREATE TABLE IF NOT EXISTS public.midia_emissoras_audiencia (
  id                  bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id          uuid        NOT NULL,
  praca               text        NOT NULL,
  ano                 int         NOT NULL,
  mes                 int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ouvintes_por_minuto numeric,
  share_audiencia     numeric,
  criado_por          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, praca, ano, mes)
);

ALTER TABLE public.midia_emissoras_audiencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "midia_emissoras_select_empresa" ON public.midia_emissoras_audiencia;
DROP POLICY IF EXISTS "midia_emissoras_write_lideranca" ON public.midia_emissoras_audiencia;
DROP POLICY IF EXISTS "midia_emissoras_update_lideranca" ON public.midia_emissoras_audiencia;
DROP POLICY IF EXISTS "midia_emissoras_delete_lideranca" ON public.midia_emissoras_audiencia;

CREATE POLICY "midia_emissoras_select_empresa" ON public.midia_emissoras_audiencia
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "midia_emissoras_write_lideranca" ON public.midia_emissoras_audiencia
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_emissoras_update_lideranca" ON public.midia_emissoras_audiencia
  FOR UPDATE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_emissoras_delete_lideranca" ON public.midia_emissoras_audiencia
  FOR DELETE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

CREATE INDEX IF NOT EXISTS midia_emissoras_empresa_periodo_idx ON public.midia_emissoras_audiencia(empresa_id, ano, mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.midia_emissoras_audiencia TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
