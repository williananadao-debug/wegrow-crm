-- Módulo Obras (Fase 1 MVP) — gestão de obra pra clientes migrando do Sienge.
-- Escopo deliberadamente pequeno: cronograma físico-financeiro com % manual
-- (sem motor de custo/curva ABC), medições de fornecedores/subempreiteiros
-- com aprovação, e suprimentos via tag simples no kardex de estoque do Pulse.
-- "Medição aprovada" gera só um lançamento de controle (tipo saida, status
-- pendente) -- o Asaas do WeGrow hoje só cobra cliente, não paga terceiro,
-- então o pagamento em si fica manual fora do sistema. Ver plano completo em
-- C:\Users\willi\.claude\plans\cozy-percolating-snail.md

CREATE TABLE IF NOT EXISTS public.obras (
  id                  bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id          uuid        NOT NULL,
  nome                text        NOT NULL,
  endereco            text,
  status              text        NOT NULL DEFAULT 'planejamento'
                        CHECK (status IN ('planejamento','em_andamento','concluida','paralisada')),
  data_inicio         date,
  data_prevista_fim   date,
  data_fim_real       date,
  valor_orcado_total  numeric,
  responsavel_id      uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_etapas (
  id                    bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id            uuid        NOT NULL,
  obra_id               bigint      NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome                  text        NOT NULL,
  ordem                 int         NOT NULL DEFAULT 0,
  peso_percentual       numeric,
  data_inicio_prevista  date,
  data_fim_prevista     date,
  percentual_previsto   numeric     NOT NULL DEFAULT 0,
  percentual_executado  numeric     NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'nao_iniciada'
                          CHECK (status IN ('nao_iniciada','em_andamento','concluida','atrasada')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_contratados (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  obra_id        bigint      NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome           text        NOT NULL,
  documento      text,
  tipo_servico   text,
  valor_contrato numeric,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.medicoes (
  id                  bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id          uuid        NOT NULL,
  obra_id             bigint      NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  obra_contratado_id  bigint      NOT NULL REFERENCES public.obra_contratados(id) ON DELETE CASCADE,
  etapa_id            bigint      REFERENCES public.obra_etapas(id) ON DELETE SET NULL,
  numero_medicao      int         NOT NULL,
  periodo_inicio      date,
  periodo_fim         date,
  valor_medido        numeric     NOT NULL,
  percentual_periodo  numeric,
  status              text        NOT NULL DEFAULT 'rascunho'
                        CHECK (status IN ('rascunho','em_aprovacao','aprovada','rejeitada','paga')),
  aprovado_por        uuid,
  aprovado_em         timestamptz,
  -- Sem FK pra lancamentos: mesmo padrão já usado no resto do sistema (o
  -- vínculo lancamentos<->leads também é informal, sem FK) -- e evita depender
  -- do tipo exato de lancamentos.id, que não está definido em nenhuma
  -- migration rastreada (tabela criada fora do fluxo, como metas).
  lancamento_id       bigint,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Suprimentos de obra: tag simples no kardex de estoque já existente do Pulse,
-- em vez de um fluxo de requisição/aprovação próprio (fica pra Fase 2).
ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS obra_id bigint REFERENCES public.obras(id) ON DELETE SET NULL;

-- ── RLS (mesmo padrão de metas/lancamentos: select pra empresa toda,
-- escrita restrita a diretor/gerente) ──────────────────────────────────
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_contratados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obras_select_empresa" ON public.obras;
DROP POLICY IF EXISTS "obras_write_lideranca" ON public.obras;
CREATE POLICY "obras_select_empresa" ON public.obras
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "obras_write_lideranca" ON public.obras
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "obra_etapas_select_empresa" ON public.obra_etapas;
DROP POLICY IF EXISTS "obra_etapas_write_lideranca" ON public.obra_etapas;
CREATE POLICY "obra_etapas_select_empresa" ON public.obra_etapas
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "obra_etapas_write_lideranca" ON public.obra_etapas
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "obra_contratados_select_empresa" ON public.obra_contratados;
DROP POLICY IF EXISTS "obra_contratados_write_lideranca" ON public.obra_contratados;
CREATE POLICY "obra_contratados_select_empresa" ON public.obra_contratados
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "obra_contratados_write_lideranca" ON public.obra_contratados
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "medicoes_select_empresa" ON public.medicoes;
DROP POLICY IF EXISTS "medicoes_write_lideranca" ON public.medicoes;
CREATE POLICY "medicoes_select_empresa" ON public.medicoes
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "medicoes_write_lideranca" ON public.medicoes
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

-- ── Índices ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS obras_empresa_id_idx ON public.obras(empresa_id);
CREATE INDEX IF NOT EXISTS obra_etapas_obra_id_idx ON public.obra_etapas(obra_id);
CREATE INDEX IF NOT EXISTS obra_etapas_empresa_id_idx ON public.obra_etapas(empresa_id);
CREATE INDEX IF NOT EXISTS obra_contratados_obra_id_idx ON public.obra_contratados(obra_id);
CREATE INDEX IF NOT EXISTS obra_contratados_empresa_id_idx ON public.obra_contratados(empresa_id);
CREATE INDEX IF NOT EXISTS medicoes_obra_id_idx ON public.medicoes(obra_id);
CREATE INDEX IF NOT EXISTS medicoes_obra_contratado_id_idx ON public.medicoes(obra_contratado_id);
CREATE INDEX IF NOT EXISTS medicoes_empresa_id_idx ON public.medicoes(empresa_id);
CREATE INDEX IF NOT EXISTS estoque_movimentacoes_obra_id_idx ON public.estoque_movimentacoes(obra_id);

-- ── GRANTs explícitos ───────────────────────────────────────────────
-- Tabelas criadas fora do dashboard do Supabase não herdam os grants padrão
-- (mesmo bug já visto em metas/nexus_arquivos/estoque_movimentacoes) --
-- aplica de uma vez pra não repetir o mesmo incidente.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obras TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_etapas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_contratados TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicoes TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
