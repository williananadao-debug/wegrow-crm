-- Módulo Mídia: painel de prestação de contas (redes sociais, site, YouTube, app,
-- monetização) nos moldes do dashboard que a IAlto monta pra Demais FM. Exclusivo
-- Demais FM a princípio (gate via empresa.modulos.midia), mesmo padrão do Max.

-- Credenciais Meta (Instagram Business + Facebook Page) por empresa. Guarda token de
-- acesso — por isso RLS restrita a diretor, diferente do resto do módulo.
CREATE TABLE IF NOT EXISTS public.midia_meta_config (
  id                    bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id            uuid        NOT NULL UNIQUE,
  ig_business_account_id text,
  fb_page_id            text,
  access_token          text,
  token_atualizado_em   timestamptz,
  criado_por            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.midia_meta_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "midia_meta_config_diretor" ON public.midia_meta_config;
CREATE POLICY "midia_meta_config_diretor" ON public.midia_meta_config
  FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.midia_meta_config TO authenticated, service_role;

-- Métricas mensais que ficam com entrada manual por enquanto (site, YouTube, app,
-- monetização, ouvintes estimado) — mesmo modelo operacional que a IAlto usa hoje
-- (arquivo atualizado uma vez por mês), até cada uma virar integração própria.
CREATE TABLE IF NOT EXISTS public.midia_metricas_mensais (
  id                              bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id                      uuid        NOT NULL,
  ano                             int         NOT NULL,
  mes                             int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ouvintes_por_minuto_estimado    numeric,
  site_acessos                    int,
  youtube_visualizacoes           int,
  youtube_observacoes             text,
  instagram_demais_news_visualizacoes int,
  instagram_demais_news_interacoes    int,
  instagram_demais_news_seguidores    int,
  app_downloads_apple_total       int,
  app_downloads_android_total     int,
  monetizacao_valor               numeric,
  criado_por                      uuid,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ano, mes)
);

ALTER TABLE public.midia_metricas_mensais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "midia_metricas_select_empresa" ON public.midia_metricas_mensais;
DROP POLICY IF EXISTS "midia_metricas_write_lideranca" ON public.midia_metricas_mensais;
DROP POLICY IF EXISTS "midia_metricas_update_lideranca" ON public.midia_metricas_mensais;
DROP POLICY IF EXISTS "midia_metricas_delete_lideranca" ON public.midia_metricas_mensais;

CREATE POLICY "midia_metricas_select_empresa" ON public.midia_metricas_mensais
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "midia_metricas_write_lideranca" ON public.midia_metricas_mensais
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_metricas_update_lideranca" ON public.midia_metricas_mensais
  FOR UPDATE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_metricas_delete_lideranca" ON public.midia_metricas_mensais
  FOR DELETE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

CREATE INDEX IF NOT EXISTS midia_metricas_empresa_periodo_idx ON public.midia_metricas_mensais(empresa_id, ano, mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.midia_metricas_mensais TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
