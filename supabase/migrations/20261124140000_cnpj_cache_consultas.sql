-- Consulta de CNPJ paga e escalável (24/11/2026): o navegador pergunta ao servidor (/api/cnpj),
-- que responde do cache (30 dias) ou da CNPJá (CNPJA_API_KEY). Sem chave, o navegador usa as
-- APIs gratuitas e guarda o resultado no cache. Cada consulta fica registrada (custo real por empresa).

CREATE TABLE IF NOT EXISTS public.cnpj_cache (
  cnpj          text        PRIMARY KEY,           -- só dígitos
  dados         jsonb       NOT NULL,              -- formato DadosCnpj (lib/consultaCnpj)
  fonte         text        NOT NULL,              -- cnpja | cnpj.ws | brasilapi
  empresa_id    uuid,                              -- preenchido quando veio do navegador: só vale para a mesma empresa
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cnpj_cache ENABLE ROW LEVEL SECURITY;  -- só o servidor (service_role) lê e grava
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cnpj_cache TO service_role;

CREATE TABLE IF NOT EXISTS public.cnpj_consultas (
  id         bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id uuid,
  user_id    uuid,
  cnpj       text        NOT NULL,
  origem     text        NOT NULL,                 -- cache | cnpja | gratuita | erro
  creditos   int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cnpj_consultas_empresa_idx ON public.cnpj_consultas(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cnpj_consultas_data_idx ON public.cnpj_consultas(created_at DESC);
ALTER TABLE public.cnpj_consultas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.cnpj_consultas TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';
