-- Módulo Rastreio (18/11/2026): plataforma de rastreamento veicular para instaladores de
-- rastreador (primeiro cliente: o sogro do Willian). Cada empresa WeGrow com modulos.rastreio
-- é um instalador/operador; os clientes finais (PF/PJ) e veículos dele ficam aqui.
--
-- Os aparelhos falam com um servidor Traccar (VPS, TCP). O Traccar repassa cada posição e
-- evento por HTTP para /api/rastreio/traccar, que grava aqui com service role. Os comandos de
-- bloqueio saem por /api/rastreio/comando → API REST do Traccar.

-- ── Clientes finais (quem paga a mensalidade) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rastreio_clientes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL,
  tipo         text        NOT NULL DEFAULT 'PF' CHECK (tipo IN ('PF', 'PJ')),
  nome         text        NOT NULL,
  documento    text,                    -- CPF ou CNPJ, só dígitos
  telefone     text,
  email        text,
  endereco     text,
  cidade       text,
  mensalidade  numeric     NOT NULL DEFAULT 0,
  dia_vencimento int       CHECK (dia_vencimento BETWEEN 1 AND 28),
  status       text        NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'suspenso', 'cancelado')),
  observacoes  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_clientes_empresa_idx ON public.rastreio_clientes(empresa_id, nome);

-- ── Veículos + aparelho instalado + última posição (o mapa lê só esta tabela) ─────────────
CREATE TABLE IF NOT EXISTS public.rastreio_veiculos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid        NOT NULL,
  cliente_id         uuid        REFERENCES public.rastreio_clientes(id) ON DELETE SET NULL,
  placa              text        NOT NULL,
  descricao          text,                  -- "Gol prata 2015"
  tipo               text        NOT NULL DEFAULT 'carro' CHECK (tipo IN ('carro', 'moto', 'caminhao', 'van', 'maquina', 'outro')),
  -- aparelho
  imei               text        NOT NULL,  -- uniqueId no Traccar
  modelo_rastreador  text,
  chip_numero        text,
  chip_operadora     text,
  tem_bloqueio       boolean     NOT NULL DEFAULT true,
  traccar_device_id  bigint,
  instalado_em       date,
  instalado_por      text,
  limite_velocidade  int,                   -- km/h; nulo = sem alerta
  status             text        NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  -- estado atual (atualizado a cada posição)
  bloqueado          boolean     NOT NULL DEFAULT false,
  ultima_lat         double precision,
  ultima_lng         double precision,
  ultima_velocidade  numeric,               -- km/h
  ultimo_curso       numeric,
  ignicao            boolean,
  bateria_externa    numeric,               -- volts (quando o aparelho manda)
  ultima_posicao_em  timestamptz,
  ultima_comunicacao_em timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- Um IMEI só pode estar em um veículo ativo no sistema todo (o webhook acha o veículo por ele).
CREATE UNIQUE INDEX IF NOT EXISTS rastreio_veiculos_imei_ativo_uq ON public.rastreio_veiculos(imei) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS rastreio_veiculos_empresa_idx ON public.rastreio_veiculos(empresa_id, placa);
CREATE INDEX IF NOT EXISTS rastreio_veiculos_cliente_idx ON public.rastreio_veiculos(cliente_id);

-- ── Histórico de posições (trajeto). Lido sempre por veículo + intervalo de datas. ────────
CREATE TABLE IF NOT EXISTS public.rastreio_posicoes (
  id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id   uuid        NOT NULL,
  veiculo_id   uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  velocidade   numeric,    -- km/h
  curso        numeric,
  ignicao      boolean,
  atributos    jsonb,
  registrado_em timestamptz NOT NULL,   -- hora do GPS
  recebido_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_posicoes_veiculo_data_idx ON public.rastreio_posicoes(veiculo_id, registrado_em DESC);

-- ── Alertas (ignição, velocidade, cerca, violação, bateria cortada...) ────────────────────
CREATE TABLE IF NOT EXISTS public.rastreio_eventos (
  id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id   uuid        NOT NULL,
  veiculo_id   uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  tipo         text        NOT NULL,   -- ignicao_ligada, ignicao_desligada, velocidade, alarme, bateria, offline, online, comando...
  mensagem     text        NOT NULL,
  lat          double precision,
  lng          double precision,
  lido         boolean     NOT NULL DEFAULT false,
  ocorrido_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_eventos_empresa_data_idx ON public.rastreio_eventos(empresa_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS rastreio_eventos_veiculo_data_idx ON public.rastreio_eventos(veiculo_id, ocorrido_em DESC);

-- ── Log de bloqueio/desbloqueio (quem, quando, onde, velocidade no momento) ──────────────
CREATE TABLE IF NOT EXISTS public.rastreio_comandos (
  id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id   uuid        NOT NULL,
  veiculo_id   uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  tipo         text        NOT NULL CHECK (tipo IN ('bloquear', 'desbloquear')),
  status       text        NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'recusado', 'erro')),
  motivo       text,                   -- por que foi pedido (roubo, inadimplência, teste...)
  detalhe      text,                   -- resposta do servidor / motivo da recusa
  velocidade_no_momento numeric,
  lat          double precision,
  lng          double precision,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_nome    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_comandos_veiculo_idx ON public.rastreio_comandos(veiculo_id, created_at DESC);

-- ── RLS: cada instalador vê só o que é dele ──────────────────────────────────────────────
ALTER TABLE public.rastreio_clientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rastreio_veiculos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rastreio_posicoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rastreio_eventos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rastreio_comandos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rastreio_clientes_empresa" ON public.rastreio_clientes;
CREATE POLICY "rastreio_clientes_empresa" ON public.rastreio_clientes
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id()))
  WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));

-- Veículo: cadastro/edição pelo navegador; posição e bloqueio só chegam pelo servidor.
DROP POLICY IF EXISTS "rastreio_veiculos_empresa" ON public.rastreio_veiculos;
CREATE POLICY "rastreio_veiculos_empresa" ON public.rastreio_veiculos
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id()))
  WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));

-- Posições e comandos: só leitura no navegador (gravação via service role).
DROP POLICY IF EXISTS "rastreio_posicoes_select" ON public.rastreio_posicoes;
CREATE POLICY "rastreio_posicoes_select" ON public.rastreio_posicoes
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));

DROP POLICY IF EXISTS "rastreio_comandos_select" ON public.rastreio_comandos;
CREATE POLICY "rastreio_comandos_select" ON public.rastreio_comandos
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));

-- Eventos: lê e marca como lido.
DROP POLICY IF EXISTS "rastreio_eventos_select" ON public.rastreio_eventos;
CREATE POLICY "rastreio_eventos_select" ON public.rastreio_eventos
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));
DROP POLICY IF EXISTS "rastreio_eventos_update" ON public.rastreio_eventos;
CREATE POLICY "rastreio_eventos_update" ON public.rastreio_eventos
  FOR UPDATE USING (empresa_id = (SELECT public.meu_empresa_id()))
  WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));
