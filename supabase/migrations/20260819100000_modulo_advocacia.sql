-- Módulo Advocacia (capability nova, desligada por padrão) — CRM financeiro/comercial pra
-- escritórios de advocacia. Segue o mesmo padrão do Argus (ver 20260812020000_modulo_argus.sql):
-- CRM reaproveita `leads` (funil, follow-up, propostas/DocuSeal já existem lá), só ganha tags
-- pra área jurídica e advogado responsável. O que é específico de advocacia de verdade
-- (tipo de honorário, % de êxito, valor da causa) vive em `advocacia_processos`, que referencia
-- `leads` e é referenciado por `lancamentos` — mesmo esquema de `argus_editais` +
-- `lancamentos.edital_id`.

-- ── Tags em `leads` ─────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS advocacia_area_juridica text,
  ADD COLUMN IF NOT EXISTS advocacia_advogado_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── `advocacia_processos` ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.advocacia_processos (
  id                        bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id                uuid        NOT NULL,
  lead_id                   bigint      REFERENCES public.leads(id) ON DELETE SET NULL,
  cliente_nome              text        NOT NULL,
  advogado_responsavel_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  area_juridica             text        NOT NULL,
  numero_processo           text,
  tipo_honorario            text        NOT NULL DEFAULT 'fixo'
                              CHECK (tipo_honorario IN ('fixo','recorrente','exito','hora')),
  valor_causa               numeric,
  honorario_fixo            numeric,
  honorario_mensal          numeric,
  percentual_exito          numeric,
  valor_hora                numeric,
  status                    text        NOT NULL DEFAULT 'ativo'
                              CHECK (status IN ('ativo','concluido','encerrado','arquivado')),
  data_inicio               date        DEFAULT CURRENT_DATE,
  data_encerramento         date,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ── Financeiro do módulo reaproveita o razão já existente, só com uma tag opcional —
-- mesmo padrão já usado em lancamentos.edital_id (Argus) e estoque_movimentacoes.obra_id (Obras).
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS processo_id bigint REFERENCES public.advocacia_processos(id) ON DELETE SET NULL;

-- ── `advocacia_canais_custo` — investimento manual por canal/mês, pra calcular CAC ──
CREATE TABLE IF NOT EXISTS public.advocacia_canais_custo (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL,
  canal             text        NOT NULL,
  ano               int         NOT NULL,
  mes               int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_investido    numeric     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, canal, ano, mes)
);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.advocacia_processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advocacia_canais_custo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advocacia_processos_select_empresa" ON public.advocacia_processos;
DROP POLICY IF EXISTS "advocacia_processos_write_lideranca" ON public.advocacia_processos;
CREATE POLICY "advocacia_processos_select_empresa" ON public.advocacia_processos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_processos_write_lideranca" ON public.advocacia_processos
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "advocacia_canais_custo_select_empresa" ON public.advocacia_canais_custo;
DROP POLICY IF EXISTS "advocacia_canais_custo_write_lideranca" ON public.advocacia_canais_custo;
CREATE POLICY "advocacia_canais_custo_select_empresa" ON public.advocacia_canais_custo
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_canais_custo_write_lideranca" ON public.advocacia_canais_custo
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

-- ── Índices ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS advocacia_processos_empresa_id_idx ON public.advocacia_processos(empresa_id);
CREATE INDEX IF NOT EXISTS advocacia_processos_lead_id_idx ON public.advocacia_processos(lead_id);
CREATE INDEX IF NOT EXISTS advocacia_processos_advogado_id_idx ON public.advocacia_processos(advogado_responsavel_id);
CREATE INDEX IF NOT EXISTS advocacia_processos_status_idx ON public.advocacia_processos(status);
CREATE INDEX IF NOT EXISTS advocacia_canais_custo_empresa_id_idx ON public.advocacia_canais_custo(empresa_id);
CREATE INDEX IF NOT EXISTS lancamentos_processo_id_idx ON public.lancamentos(processo_id);
CREATE INDEX IF NOT EXISTS leads_advocacia_advogado_id_idx ON public.leads(advocacia_advogado_id);

-- ── GRANTs explícitos ───────────────────────────────────────────────
-- Tabelas criadas fora do dashboard do Supabase não herdam os grants padrão
-- (mesmo bug já visto em metas/nexus_arquivos/estoque_movimentacoes/obras/argus).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advocacia_processos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advocacia_canais_custo TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
