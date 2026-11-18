-- Rastreio, parte 2 (18/11/2026):
-- 1) GRANTs que faltaram na 20261118120000 (as tabelas nasceram sem permissão pros papéis da
--    API — mesmo problema do portal do cliente/visitas). RLS continua valendo.
-- 2) App do cliente final (/meu-rastreio): o cliente NÃO é usuário do Supabase Auth. Entra por
--    link de convite de uso único (o instalador manda pelo WhatsApp), que vira sessão em cookie
--    httpOnly. Só o hash do token/sessão fica no banco. Bloqueio pelo app exige PIN do cliente.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_clientes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_veiculos TO authenticated, service_role;
GRANT SELECT ON public.rastreio_posicoes TO authenticated;
GRANT SELECT, UPDATE ON public.rastreio_eventos TO authenticated;
GRANT SELECT ON public.rastreio_comandos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_posicoes, public.rastreio_eventos, public.rastreio_comandos TO service_role;

-- PIN de bloqueio do app (scrypt "salt:hash"); nulo = cliente ainda não criou.
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS app_pin_hash text;
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS app_ultimo_acesso timestamptz;

-- Comando pedido pelo próprio cliente no app (user_id fica nulo).
ALTER TABLE public.rastreio_comandos ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'painel';

CREATE TABLE IF NOT EXISTS public.rastreio_app_convites (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id  uuid        NOT NULL,
  cliente_id  uuid        NOT NULL REFERENCES public.rastreio_clientes(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz,
  criado_por  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rastreio_app_sessoes (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id    uuid        NOT NULL,
  cliente_id    uuid        NOT NULL REFERENCES public.rastreio_clientes(id) ON DELETE CASCADE,
  sessao_hash   text        NOT NULL UNIQUE,
  expira_em     timestamptz NOT NULL,
  ultimo_acesso timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_app_sessoes_cliente_idx ON public.rastreio_app_sessoes(cliente_id);

-- Sem policy: só o servidor (service role) lê/grava convites e sessões.
ALTER TABLE public.rastreio_app_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rastreio_app_sessoes  ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_app_convites, public.rastreio_app_sessoes TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';
