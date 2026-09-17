-- Chave do Asaas por empresa — "financeiro/cobranca" usava uma ASAAS_API_KEY global
-- (a da própria WeGrow), o que fazia boleto/Pix de QUALQUER empresa cair na conta Asaas
-- da WeGrow em vez da conta da própria empresa. Mesmo padrão do fiscal_integracoes
-- (Focus NFe): cada empresa guarda a própria chave aqui, service role only.

CREATE TABLE IF NOT EXISTS public.financeiro_integracoes (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  provider          text        NOT NULL DEFAULT 'asaas',
  asaas_api_key     text,
  ambiente          text        NOT NULL DEFAULT 'producao' CHECK (ambiente IN ('sandbox', 'producao')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_integracoes ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy de propósito — chave sensível, só service role (via API) acessa.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_integracoes TO service_role;

CREATE INDEX IF NOT EXISTS financeiro_integracoes_empresa_id_idx ON public.financeiro_integracoes(empresa_id);
