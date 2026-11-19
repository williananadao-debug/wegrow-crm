-- Rastreio, parte 5 (19/11/2026): o que as plataformas de rastreio (ex.: Traccar/Anjia) têm e
-- faltava aqui. 1) Resumo diário por veículo (relatórios de 31 dias sem baixar posições);
-- 2) hodômetro + manutenção programada; 3) motoristas; 4) notificação no celular (app nativo)
-- com preferência de quais alertas cada cliente quer receber.

-- 1) Resumo diário (calculado pelo cron a partir de rastreio_posicoes)
CREATE TABLE IF NOT EXISTS public.rastreio_resumo_diario (
  veiculo_id        uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  dia               date        NOT NULL,
  empresa_id        uuid        NOT NULL,
  km                numeric(10,2) NOT NULL DEFAULT 0,
  minutos_movimento integer     NOT NULL DEFAULT 0,
  minutos_ligado    integer     NOT NULL DEFAULT 0,
  paradas           integer     NOT NULL DEFAULT 0,
  viagens           integer     NOT NULL DEFAULT 0,
  velocidade_max    integer     NOT NULL DEFAULT 0,
  excessos          integer     NOT NULL DEFAULT 0,
  primeira_posicao  timestamptz,
  ultima_posicao    timestamptz,
  pontos            integer     NOT NULL DEFAULT 0,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (veiculo_id, dia)
);
CREATE INDEX IF NOT EXISTS rastreio_resumo_empresa_dia_idx ON public.rastreio_resumo_diario(empresa_id, dia DESC);
ALTER TABLE public.rastreio_resumo_diario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_resumo_select" ON public.rastreio_resumo_diario;
CREATE POLICY "rastreio_resumo_select" ON public.rastreio_resumo_diario
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT ON public.rastreio_resumo_diario TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_resumo_diario TO service_role;

-- 2) Hodômetro: valor informado na instalação + km rodado desde então (somado pelo cron)
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS odometro_base_km numeric(12,1) NOT NULL DEFAULT 0;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS odometro_base_em date;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS odometro_km numeric(12,1) NOT NULL DEFAULT 0;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS motorista_id uuid;

CREATE TABLE IF NOT EXISTS public.rastreio_manutencoes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL,
  veiculo_id      uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  nome            text        NOT NULL,
  intervalo_km    integer     CHECK (intervalo_km IS NULL OR intervalo_km > 0),
  intervalo_dias  integer     CHECK (intervalo_dias IS NULL OR intervalo_dias > 0),
  ultima_km       numeric(12,1),
  ultima_em       date,
  avisado_em      timestamptz,
  ativo           boolean     NOT NULL DEFAULT true,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (intervalo_km IS NOT NULL OR intervalo_dias IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS rastreio_manutencoes_veiculo_idx ON public.rastreio_manutencoes(veiculo_id);
ALTER TABLE public.rastreio_manutencoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_manutencoes_empresa" ON public.rastreio_manutencoes;
CREATE POLICY "rastreio_manutencoes_empresa" ON public.rastreio_manutencoes
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id()))
  WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_manutencoes TO authenticated, service_role;

-- 3) Motoristas (frotas PJ)
CREATE TABLE IF NOT EXISTS public.rastreio_motoristas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL,
  cliente_id  uuid        REFERENCES public.rastreio_clientes(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  telefone    text,
  cnh         text,
  cnh_validade date,
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_motoristas_empresa_idx ON public.rastreio_motoristas(empresa_id);
ALTER TABLE public.rastreio_motoristas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_motoristas_empresa" ON public.rastreio_motoristas;
CREATE POLICY "rastreio_motoristas_empresa" ON public.rastreio_motoristas
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id()))
  WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_motoristas TO authenticated, service_role;

-- 4) Notificação no celular do cliente final (app nativo / PWA)
CREATE TABLE IF NOT EXISTS public.rastreio_push_tokens (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id  uuid        NOT NULL,
  cliente_id  uuid        NOT NULL REFERENCES public.rastreio_clientes(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  plataforma  text        NOT NULL DEFAULT 'android',
  ultimo_uso  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_push_tokens_cliente_idx ON public.rastreio_push_tokens(cliente_id);
ALTER TABLE public.rastreio_push_tokens ENABLE ROW LEVEL SECURITY;  -- sem policy: só o servidor
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_push_tokens TO service_role;

-- Quais alertas o cliente quer receber no celular (nulo = padrão: todos os importantes)
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS app_alertas jsonb;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
