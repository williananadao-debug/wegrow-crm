-- Credenciais Meta (Instagram Business) pra aba Marketing da vertical veículos do
-- Argus. Reaproveita o mesmo cliente genérico (src/lib/meta-graph.ts) já usado no
-- módulo Mídia, só que numa tabela própria porque é uma loja diferente (GB Motors),
-- não a Demais FM. RLS restrita a diretor — guarda access_token.
CREATE TABLE IF NOT EXISTS public.argus_meta_config (
  id                     bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id             uuid        NOT NULL UNIQUE,
  ig_business_account_id text,
  access_token           text,
  token_atualizado_em    timestamptz,
  criado_por             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.argus_meta_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "argus_meta_config_diretor" ON public.argus_meta_config;
CREATE POLICY "argus_meta_config_diretor" ON public.argus_meta_config
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.argus_meta_config TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
