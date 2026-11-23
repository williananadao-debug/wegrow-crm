-- Rastreio, parte 6 (23/11/2026): contrato com assinatura eletrônica, dados do contrato do
-- instalador, comandos de configuração do rastreador (GT06) e cercas criadas pelo cliente no app.
-- Cobrança avulsa (instalação/equipamento) não precisa de tabela nova: o pagamento vem do Asaas
-- com externalReference "rastreio:<cliente>" e cai em rastreio_cobrancas, como a mensalidade.

-- Dados do instalador que vão no contrato + condições padrão
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS emp_razao       text;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS emp_documento   text;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS emp_endereco    text;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS emp_cidade      text;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS emp_uf          text;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS emp_telefone    text;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS emp_email       text;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS contrato_fidelidade_meses integer NOT NULL DEFAULT 12;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS contrato_valor_equipamento numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS contrato_taxa_instalacao  numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS contrato_texto_extra      text;

-- Contratos enviados para assinatura (DocuSeal)
CREATE TABLE IF NOT EXISTS public.rastreio_contratos (
  id               bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id       uuid        NOT NULL,
  cliente_id       uuid        NOT NULL REFERENCES public.rastreio_clientes(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'assinado', 'cancelado')),
  submission_id    text        UNIQUE,
  link_empresa     text,
  link_cliente     text,
  arquivos         jsonb,
  enviado_por      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  assinado_em      timestamptz
);
CREATE INDEX IF NOT EXISTS rastreio_contratos_cliente_idx ON public.rastreio_contratos(cliente_id, created_at DESC);
ALTER TABLE public.rastreio_contratos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_contratos_select" ON public.rastreio_contratos;
CREATE POLICY "rastreio_contratos_select" ON public.rastreio_contratos
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT ON public.rastreio_contratos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_contratos TO service_role;

-- Comandos de configuração do aparelho (localizar, status, intervalo, SOS...) no mesmo log do bloqueio
ALTER TABLE public.rastreio_comandos DROP CONSTRAINT IF EXISTS rastreio_comandos_tipo_check;
ALTER TABLE public.rastreio_comandos ADD CONSTRAINT rastreio_comandos_tipo_check CHECK (tipo IN ('bloquear', 'desbloquear', 'configurar'));
ALTER TABLE public.rastreio_comandos ADD COLUMN IF NOT EXISTS comando text;

-- Cerca criada pelo próprio cliente no app
ALTER TABLE public.rastreio_cercas ADD COLUMN IF NOT EXISTS criada_pelo_cliente boolean NOT NULL DEFAULT false;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
