-- Rastreio, parte 4 (19/11/2026): cobrança das mensalidades do cliente final.
-- O dinheiro cai na conta Asaas do INSTALADOR (financeiro_integracoes da empresa dele). A taxa
-- da WeGrow sai no split (% de cada mensalidade paga) para a carteira Asaas da WeGrow.
-- Assinatura mensal por cliente (boleto/Pix/cartão recorrente), NFS-e opcional pelo próprio
-- Asaas, e suspensão automática do app depois de N dias de atraso.

-- Configuração por empresa. taxa_wegrow_pct é definida pela WeGrow (sem policy de escrita).
CREATE TABLE IF NOT EXISTS public.rastreio_cobranca_config (
  empresa_id        uuid        PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  taxa_wegrow_pct   numeric(5,2) NOT NULL DEFAULT 0 CHECK (taxa_wegrow_pct BETWEEN 0 AND 50),
  dias_suspensao    integer     NOT NULL DEFAULT 10 CHECK (dias_suspensao BETWEEN 0 AND 120),
  multa_pct         numeric(5,2) NOT NULL DEFAULT 2,
  juros_mes_pct     numeric(5,2) NOT NULL DEFAULT 1,
  nfse_automatica   boolean     NOT NULL DEFAULT false,
  nfse_servico_codigo    text,
  nfse_servico_descricao text DEFAULT 'Serviço de monitoramento e rastreamento veicular',
  webhook_token     text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rastreio_cobranca_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_cobranca_config_select" ON public.rastreio_cobranca_config;
CREATE POLICY "rastreio_cobranca_config_select" ON public.rastreio_cobranca_config
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT ON public.rastreio_cobranca_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_cobranca_config TO service_role;

ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS asaas_customer_id   text;
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS asaas_assinatura_id text;
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS assinatura_status   text;  -- ativa | cancelada | null
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS forma_pagamento     text NOT NULL DEFAULT 'UNDEFINED';
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS em_atraso_desde     date;
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS suspenso_automatico boolean NOT NULL DEFAULT false;

-- Espelho dos pagamentos do Asaas (webhook + sincronização diária).
CREATE TABLE IF NOT EXISTS public.rastreio_cobrancas (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL,
  cliente_id        uuid        NOT NULL REFERENCES public.rastreio_clientes(id) ON DELETE CASCADE,
  asaas_payment_id  text        NOT NULL UNIQUE,
  asaas_assinatura_id text,
  descricao         text,
  valor             numeric(12,2) NOT NULL DEFAULT 0,
  valor_liquido     numeric(12,2),
  taxa_wegrow       numeric(12,2),
  vencimento        date,
  pago_em           date,
  status            text        NOT NULL,
  forma             text,
  invoice_url       text,
  nf_url            text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_cobrancas_empresa_venc_idx ON public.rastreio_cobrancas(empresa_id, vencimento DESC);
CREATE INDEX IF NOT EXISTS rastreio_cobrancas_cliente_idx ON public.rastreio_cobrancas(cliente_id, vencimento DESC);

ALTER TABLE public.rastreio_cobrancas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_cobrancas_select" ON public.rastreio_cobrancas;
CREATE POLICY "rastreio_cobrancas_select" ON public.rastreio_cobrancas
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT ON public.rastreio_cobrancas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_cobrancas TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';
