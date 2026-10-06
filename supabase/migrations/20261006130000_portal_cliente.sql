-- Portal do Cliente (primeiro uso: Trailer Travel) — o comprador acompanha produção (etapas
-- e fotos), financeiro (parcelas/boletos) e contrato, com login por link mágico no e-mail.
--
-- O cliente NÃO vira usuário do Supabase Auth: ele não tem perfil/empresa e não deve chegar
-- perto das tabelas do CRM. Acesso é por sessão própria (cookie httpOnly com token aleatório,
-- só o hash fica no banco) e TODO dado passa pelas rotas /api/portal-cliente/* com service
-- role, filtrado pelo cliente da sessão. Por isso as tabelas abaixo ficam com RLS ligado e
-- nenhuma policy: anon/authenticated não leem nem escrevem nada nelas.
--
-- Liga por empresa em empresas.modulos.portal_cliente (Admin → Módulos).

CREATE TABLE IF NOT EXISTS public.portal_cliente_tokens (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id  uuid        NOT NULL,
  cliente_id  bigint      NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  token_hash  text        NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_cliente_tokens_email_idx ON public.portal_cliente_tokens (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS public.portal_cliente_sessoes (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  cliente_id     bigint      NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  email          text        NOT NULL,
  sessao_hash    text        NOT NULL UNIQUE,
  expira_em      timestamptz NOT NULL,
  ultimo_acesso  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_cliente_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cliente_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_cliente_tokens  FROM anon, authenticated;
REVOKE ALL ON public.portal_cliente_sessoes FROM anon, authenticated;

-- Quando o convite do portal foi enviado pra essa venda (evita reenviar a cada edição e
-- mostra na tela de venda que o cliente já recebeu o acesso).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS portal_convite_enviado_em timestamptz;

-- Parcelas do plano de pagamento (entrada / p1..pN) que a equipe marcou como pagas, pra
-- venda que NÃO usa boleto Asaas (essas já se confirmam sozinhas em cobrancas_manuais).
-- Formato: {"entrada": "2026-10-01", "p1": "2026-11-10"} — chave → data do pagamento.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS parcelas_pagas jsonb;
