-- ============================================================
-- EMPRESAS + UNIDADES — WeGrow CRM
-- ============================================================
-- 1. Tabela empresas (super-admin: plano, status, módulos)
-- 2. Tabela unidades (filiais por empresa — substitui hardcode)
-- ============================================================


-- ============================================================
-- 1. EMPRESAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.empresas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        NOT NULL,
  cnpj        text,
  plano       text        NOT NULL DEFAULT 'essencial'
                          CHECK (plano IN ('essencial', 'pro', 'enterprise')),
  status      text        NOT NULL DEFAULT 'trial'
                          CHECK (status IN ('trial', 'ativa', 'suspensa')),
  modulos     jsonb       NOT NULL DEFAULT
                          '{"opec":false,"ia":false,"financeiro":false,"whatsapp":false}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Apenas service_role (admin) acessa diretamente
DROP POLICY IF EXISTS "empresas_deny_all" ON public.empresas;
CREATE POLICY "empresas_deny_all" ON public.empresas
  FOR ALL USING (false);


-- ============================================================
-- 2. UNIDADES (filiais por empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.unidades (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL,
  nome         text        NOT NULL,
  razao_social text,
  cnpj         text,
  endereco     text,
  cidade       text,
  estado       text        DEFAULT 'SC',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unidades_select_empresa"   ON public.unidades;
DROP POLICY IF EXISTS "unidades_insert_diretor"   ON public.unidades;
DROP POLICY IF EXISTS "unidades_update_diretor"   ON public.unidades;
DROP POLICY IF EXISTS "unidades_delete_diretor"   ON public.unidades;

CREATE POLICY "unidades_select_empresa" ON public.unidades
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "unidades_insert_diretor" ON public.unidades
  FOR INSERT WITH CHECK (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );

CREATE POLICY "unidades_update_diretor" ON public.unidades
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor')
  WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "unidades_delete_diretor" ON public.unidades
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );
