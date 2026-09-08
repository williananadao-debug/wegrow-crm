-- Credenciais do Focus NFe por empresa — tabela separada de "empresas" de propósito.
-- "empresas" é lido pelo próprio tenant no client (RLS por empresa_id); esses tokens
-- emitem documento fiscal real em nome da empresa e não podem nunca chegar no navegador
-- do cliente. Só service role acessa (mesmo padrão de wegrow_prospects/clientes_wegrow),
-- todo acesso passa por API route server-side.
CREATE TABLE IF NOT EXISTS public.fiscal_integracoes (
  id                      bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id              uuid        NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  provider                text        NOT NULL DEFAULT 'focus_nfe',
  focus_nfe_empresa_id    integer,           -- id da empresa dentro da conta Focus NFe (ex: 255096)
  token_producao          text,
  token_homologacao       text,
  ambiente_ativo          text        NOT NULL DEFAULT 'homologacao' CHECK (ambiente_ativo IN ('homologacao', 'producao')),
  regime_tributario       text,              -- espelha o cadastrado no Focus NFe (1=Simples Nacional, 2=Simples excesso, 3=Normal)
  certificado_valido_ate  date,              -- só pra exibir aviso de vencimento no admin, o arquivo em si fica só no Focus NFe
  webhook_secret          text,              -- valida que a chamada recebida em /api/webhooks/focus-nfe realmente veio do Focus NFe
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_integracoes ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy de propósito — só service role (via API) acessa.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_integracoes TO service_role;

CREATE INDEX IF NOT EXISTS fiscal_integracoes_empresa_id_idx ON public.fiscal_integracoes(empresa_id);
