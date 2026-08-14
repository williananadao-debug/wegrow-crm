-- Percentual de comissão pra vertical "veículos" do Argus (aba Comissões). Uma linha
-- por empresa — se no futuro precisar de taxa por vendedor, evolui pra uma coluna
-- vendedor_id nullable em vez de tabela nova.
CREATE TABLE IF NOT EXISTS public.argus_comissao_config (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id  uuid        NOT NULL UNIQUE,
  percentual  numeric     NOT NULL DEFAULT 0,
  criado_por  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.argus_comissao_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "argus_comissao_select_empresa" ON public.argus_comissao_config;
DROP POLICY IF EXISTS "argus_comissao_write_lideranca" ON public.argus_comissao_config;

CREATE POLICY "argus_comissao_select_empresa" ON public.argus_comissao_config
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "argus_comissao_write_lideranca" ON public.argus_comissao_config
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.argus_comissao_config TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
