-- Módulo Argus (Fase 1) — licitações públicas + agente de IA. Sincroniza com a
-- API pública real do PNCP (confirmada via spike em 2026-08-12: sem autenticação,
-- https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao, campos reais:
-- numeroControlePNCP, situacaoCompraNome, valorTotalEstimado/Homologado,
-- objetoCompra, orgaoEntidade, unidadeOrgao, dataAberturaProposta/
-- dataEncerramentoProposta). ComprasNet/Licitações-e/BLL Compras ficam fora da v1
-- (Licitações-e e BLL não têm API pública). Ver plano completo em
-- C:\Users\willi\.claude\plans\cozy-percolating-snail.md

CREATE TABLE IF NOT EXISTS public.argus_filtros_busca (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  nome           text        NOT NULL,
  uf             text,
  modalidade     int,
  palavras_chave text,
  cnae           text,
  ativo          boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.argus_editais (
  id                      bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id              uuid        NOT NULL,
  origem                  text        NOT NULL DEFAULT 'manual'
                            CHECK (origem IN ('pncp','manual')),
  numero_controle_pncp    text,
  numero_processo         text,
  orgao                   text,
  modalidade              text,
  objeto                  text,
  uf                      text,
  municipio               text,
  status_interesse        text        NOT NULL DEFAULT 'candidato'
                            CHECK (status_interesse IN ('candidato','acompanhando','proposta_enviada','ganho','perdido','arquivado')),
  estagio_processo        text,
  valor_estimado          numeric,
  valor_homologado        numeric,
  valor_proposto          numeric,
  margem_estimada         numeric,
  concorrentes            int,
  posicao_atual           text,
  data_sessao             timestamptz,
  data_encerramento_proposta timestamptz,
  link_pncp               text,
  raw_payload             jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.argus_edital_alertas (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id  uuid        NOT NULL,
  edital_id   bigint      NOT NULL REFERENCES public.argus_editais(id) ON DELETE CASCADE,
  severidade  text        NOT NULL DEFAULT 'amber'
                CHECK (severidade IN ('vermelho','amber','verde')),
  tipo        text,
  mensagem    text        NOT NULL,
  resolvido   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.argus_edital_eventos (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id  uuid        NOT NULL,
  edital_id   bigint      NOT NULL REFERENCES public.argus_editais(id) ON DELETE CASCADE,
  titulo      text        NOT NULL,
  descricao   text,
  data_evento timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.argus_contratos (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  edital_id      bigint      REFERENCES public.argus_editais(id) ON DELETE SET NULL,
  orgao          text,
  objeto         text,
  valor_contrato numeric,
  data_inicio    date,
  data_fim       date,
  status         text        NOT NULL DEFAULT 'ativo'
                   CHECK (status IN ('ativo','encerrado','rescindido')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Financeiro do Argus reaproveita o razão já existente, só com uma tag opcional —
-- mesmo padrão já usado em estoque_movimentacoes.obra_id (módulo Obras).
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS edital_id bigint REFERENCES public.argus_editais(id) ON DELETE SET NULL;

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.argus_filtros_busca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argus_editais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argus_edital_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argus_edital_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.argus_contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "argus_filtros_busca_select_empresa" ON public.argus_filtros_busca;
DROP POLICY IF EXISTS "argus_filtros_busca_write_lideranca" ON public.argus_filtros_busca;
CREATE POLICY "argus_filtros_busca_select_empresa" ON public.argus_filtros_busca
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "argus_filtros_busca_write_lideranca" ON public.argus_filtros_busca
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "argus_editais_select_empresa" ON public.argus_editais;
DROP POLICY IF EXISTS "argus_editais_write_lideranca" ON public.argus_editais;
CREATE POLICY "argus_editais_select_empresa" ON public.argus_editais
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "argus_editais_write_lideranca" ON public.argus_editais
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "argus_edital_alertas_select_empresa" ON public.argus_edital_alertas;
DROP POLICY IF EXISTS "argus_edital_alertas_write_lideranca" ON public.argus_edital_alertas;
CREATE POLICY "argus_edital_alertas_select_empresa" ON public.argus_edital_alertas
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "argus_edital_alertas_write_lideranca" ON public.argus_edital_alertas
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "argus_edital_eventos_select_empresa" ON public.argus_edital_eventos;
DROP POLICY IF EXISTS "argus_edital_eventos_write_lideranca" ON public.argus_edital_eventos;
CREATE POLICY "argus_edital_eventos_select_empresa" ON public.argus_edital_eventos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "argus_edital_eventos_write_lideranca" ON public.argus_edital_eventos
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

DROP POLICY IF EXISTS "argus_contratos_select_empresa" ON public.argus_contratos;
DROP POLICY IF EXISTS "argus_contratos_write_lideranca" ON public.argus_contratos;
CREATE POLICY "argus_contratos_select_empresa" ON public.argus_contratos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "argus_contratos_write_lideranca" ON public.argus_contratos
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

-- ── Índices ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS argus_filtros_busca_empresa_id_idx ON public.argus_filtros_busca(empresa_id);
CREATE INDEX IF NOT EXISTS argus_editais_empresa_id_idx ON public.argus_editais(empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS argus_editais_numero_controle_pncp_empresa_uidx
  ON public.argus_editais(empresa_id, numero_controle_pncp) WHERE numero_controle_pncp IS NOT NULL;
CREATE INDEX IF NOT EXISTS argus_editais_status_interesse_idx ON public.argus_editais(status_interesse);
CREATE INDEX IF NOT EXISTS argus_edital_alertas_edital_id_idx ON public.argus_edital_alertas(edital_id);
CREATE INDEX IF NOT EXISTS argus_edital_alertas_empresa_id_idx ON public.argus_edital_alertas(empresa_id);
CREATE INDEX IF NOT EXISTS argus_edital_eventos_edital_id_idx ON public.argus_edital_eventos(edital_id);
CREATE INDEX IF NOT EXISTS argus_edital_eventos_empresa_id_idx ON public.argus_edital_eventos(empresa_id);
CREATE INDEX IF NOT EXISTS argus_contratos_empresa_id_idx ON public.argus_contratos(empresa_id);
CREATE INDEX IF NOT EXISTS argus_contratos_edital_id_idx ON public.argus_contratos(edital_id);
CREATE INDEX IF NOT EXISTS lancamentos_edital_id_idx ON public.lancamentos(edital_id);

-- ── GRANTs explícitos ───────────────────────────────────────────────
-- Tabelas criadas fora do dashboard do Supabase não herdam os grants padrão
-- (mesmo bug já visto em metas/nexus_arquivos/estoque_movimentacoes/obras).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.argus_filtros_busca TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.argus_editais TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.argus_edital_alertas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.argus_edital_eventos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.argus_contratos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
