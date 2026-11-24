-- Rastreio, parte 7 (24/11/2026): alertas de segurança (reboque, uso fora de horário, sem
-- comunicação), central de ocorrências (roubo/furto), estoque de rastreadores e chips, ordens de
-- serviço e relatórios de frota (ocioso, condução, combustível).

-- Veículo: horário permitido de uso, consumo e controle dos alertas (não repetir)
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS horario_uso jsonb;              -- {dias:[1..5], inicio:'07:00', fim:'19:00'}
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS consumo_km_l numeric(6,2);
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS alerta_reboque_em timestamptz;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS alerta_horario_em timestamptz;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS alerta_sem_comunicacao_em timestamptz;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS ocorrencia_aberta_id bigint;

-- Resumo do dia: motor ligado parado, condução e motorista do dia
ALTER TABLE public.rastreio_resumo_diario ADD COLUMN IF NOT EXISTS minutos_ocioso integer NOT NULL DEFAULT 0;
ALTER TABLE public.rastreio_resumo_diario ADD COLUMN IF NOT EXISTS freadas integer NOT NULL DEFAULT 0;
ALTER TABLE public.rastreio_resumo_diario ADD COLUMN IF NOT EXISTS aceleracoes integer NOT NULL DEFAULT 0;
ALTER TABLE public.rastreio_resumo_diario ADD COLUMN IF NOT EXISTS nota_conducao integer;
ALTER TABLE public.rastreio_resumo_diario ADD COLUMN IF NOT EXISTS motorista_id uuid;

-- Configuração do instalador
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS preco_combustivel numeric(6,2) NOT NULL DEFAULT 6.00;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS dias_sem_comunicacao integer NOT NULL DEFAULT 2;
ALTER TABLE public.rastreio_cobranca_config ADD COLUMN IF NOT EXISTS email_alarmes boolean NOT NULL DEFAULT true;

-- Central de ocorrências
CREATE TABLE IF NOT EXISTS public.rastreio_ocorrencias (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id    uuid        NOT NULL,
  veiculo_id    uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  cliente_id    uuid,
  tipo          text        NOT NULL DEFAULT 'roubo' CHECK (tipo IN ('roubo', 'furto', 'suspeita', 'sinistro', 'outro')),
  status        text        NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'recuperado', 'encerrada')),
  descricao     text,
  bo_numero     text,
  origem        text        NOT NULL DEFAULT 'painel',          -- painel | app
  aberta_por    text,
  aberta_em     timestamptz NOT NULL DEFAULT now(),
  encerrada_em  timestamptz,
  link_compartilhamento text,
  linha_tempo   jsonb       NOT NULL DEFAULT '[]'::jsonb        -- [{em, texto, autor}]
);
CREATE INDEX IF NOT EXISTS rastreio_ocorrencias_empresa_idx ON public.rastreio_ocorrencias(empresa_id, aberta_em DESC);
ALTER TABLE public.rastreio_ocorrencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_ocorrencias_empresa" ON public.rastreio_ocorrencias;
CREATE POLICY "rastreio_ocorrencias_empresa" ON public.rastreio_ocorrencias
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id())) WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_ocorrencias TO authenticated, service_role;

-- Estoque de rastreadores e chips
CREATE TABLE IF NOT EXISTS public.rastreio_equipamentos (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  tipo           text        NOT NULL DEFAULT 'rastreador' CHECK (tipo IN ('rastreador', 'chip')),
  modelo         text,
  imei           text,
  chip_numero    text,
  chip_operadora text,
  iccid          text,
  custo_compra   numeric(12,2) NOT NULL DEFAULT 0,
  custo_mensal   numeric(12,2) NOT NULL DEFAULT 0,
  status         text        NOT NULL DEFAULT 'estoque' CHECK (status IN ('estoque', 'instalado', 'defeito', 'devolvido', 'perdido')),
  veiculo_id     uuid        REFERENCES public.rastreio_veiculos(id) ON DELETE SET NULL,
  observacao     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rastreio_equip_imei_uk ON public.rastreio_equipamentos(empresa_id, imei) WHERE imei IS NOT NULL AND imei <> '';
CREATE UNIQUE INDEX IF NOT EXISTS rastreio_equip_iccid_uk ON public.rastreio_equipamentos(empresa_id, iccid) WHERE iccid IS NOT NULL AND iccid <> '';
ALTER TABLE public.rastreio_equipamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_equipamentos_empresa" ON public.rastreio_equipamentos;
CREATE POLICY "rastreio_equipamentos_empresa" ON public.rastreio_equipamentos
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id())) WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_equipamentos TO authenticated, service_role;

-- Ordens de serviço (instalação, manutenção, retirada...)
CREATE TABLE IF NOT EXISTS public.rastreio_os (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id    uuid        NOT NULL,
  tipo          text        NOT NULL DEFAULT 'instalacao' CHECK (tipo IN ('instalacao', 'manutencao', 'retirada', 'troca', 'vistoria')),
  cliente_id    uuid        REFERENCES public.rastreio_clientes(id) ON DELETE SET NULL,
  veiculo_id    uuid        REFERENCES public.rastreio_veiculos(id) ON DELETE SET NULL,
  tecnico       text,
  agendada_para timestamptz,
  endereco      text,
  status        text        NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'em_andamento', 'concluida', 'cancelada')),
  checklist     jsonb       NOT NULL DEFAULT '[]'::jsonb,       -- [{item, ok}]
  fotos         jsonb       NOT NULL DEFAULT '[]'::jsonb,       -- [{nome, path}]
  observacao    text,
  valor         numeric(12,2),
  criado_por    text,
  concluida_em  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_os_empresa_idx ON public.rastreio_os(empresa_id, agendada_para DESC);
ALTER TABLE public.rastreio_os ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_os_empresa" ON public.rastreio_os;
CREATE POLICY "rastreio_os_empresa" ON public.rastreio_os
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id())) WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_os TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
