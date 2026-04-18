-- ============================================================
-- RLS MULTI-TENANT — WeGrow CRM
-- ============================================================

-- Funções helper (schema public — sem permissão no schema auth)
CREATE OR REPLACE FUNCTION public.meu_empresa_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT empresa_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.meu_cargo()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cargo FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- TABELA: profiles
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_same_empresa" ON public.profiles;
CREATE POLICY "profiles_select_same_empresa" ON public.profiles
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- TABELA: leads
-- ============================================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_empresa"      ON public.leads;
DROP POLICY IF EXISTS "leads_insert_empresa"      ON public.leads;
DROP POLICY IF EXISTS "leads_update_empresa"      ON public.leads;
DROP POLICY IF EXISTS "leads_delete_diretor"      ON public.leads;
DROP POLICY IF EXISTS "leads_insert_portal_anon"  ON public.leads;

CREATE POLICY "leads_select_empresa" ON public.leads
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "leads_insert_empresa" ON public.leads
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "leads_update_empresa" ON public.leads
  FOR UPDATE USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "leads_delete_diretor" ON public.leads
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );

-- Portal público: anon só pode inserir leads na empresa dona do portal
CREATE POLICY "leads_insert_portal_anon" ON public.leads
  FOR INSERT TO anon
  WITH CHECK (empresa_id = '11111111-1111-1111-1111-111111111111'::uuid);

-- ============================================================
-- TABELA: clientes
-- ============================================================
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_select_empresa" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert_empresa" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update_empresa" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete_diretor" ON public.clientes;

CREATE POLICY "clientes_select_empresa" ON public.clientes
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "clientes_insert_empresa" ON public.clientes
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "clientes_update_empresa" ON public.clientes
  FOR UPDATE USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "clientes_delete_diretor" ON public.clientes
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );

-- ============================================================
-- TABELA: jobs
-- ============================================================
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_select_empresa" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_empresa" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_empresa" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_diretor" ON public.jobs;

CREATE POLICY "jobs_select_empresa" ON public.jobs
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "jobs_insert_empresa" ON public.jobs
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "jobs_update_empresa" ON public.jobs
  FOR UPDATE USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "jobs_delete_diretor" ON public.jobs
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );

-- ============================================================
-- Tabelas opcionais: só aplica RLS se existirem no banco
-- ============================================================
DO $$ BEGIN

  -- metas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='metas') THEN
    ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "metas_select_empresa" ON public.metas;
    DROP POLICY IF EXISTS "metas_write_diretor"  ON public.metas;
    EXECUTE $p$ CREATE POLICY "metas_select_empresa" ON public.metas
      FOR SELECT USING (empresa_id = public.meu_empresa_id()); $p$;
    EXECUTE $p$ CREATE POLICY "metas_write_diretor" ON public.metas
      FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor'); $p$;
  END IF;

  -- lancamentos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lancamentos') THEN
    ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "lancamentos_select_empresa"   ON public.lancamentos;
    DROP POLICY IF EXISTS "lancamentos_write_lideranca"  ON public.lancamentos;
    EXECUTE $p$ CREATE POLICY "lancamentos_select_empresa" ON public.lancamentos
      FOR SELECT USING (empresa_id = public.meu_empresa_id()); $p$;
    EXECUTE $p$ CREATE POLICY "lancamentos_write_lideranca" ON public.lancamentos
      FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente')); $p$;
  END IF;

  -- servicos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='servicos') THEN
    ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "servicos_select_empresa" ON public.servicos;
    DROP POLICY IF EXISTS "servicos_write_diretor"  ON public.servicos;
    EXECUTE $p$ CREATE POLICY "servicos_select_empresa" ON public.servicos
      FOR SELECT USING (empresa_id = public.meu_empresa_id()); $p$;
    EXECUTE $p$ CREATE POLICY "servicos_write_diretor" ON public.servicos
      FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor'); $p$;
  END IF;

  -- premissas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='premissas') THEN
    ALTER TABLE public.premissas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "premissas_select_empresa" ON public.premissas;
    DROP POLICY IF EXISTS "premissas_write_diretor"  ON public.premissas;
    EXECUTE $p$ CREATE POLICY "premissas_select_empresa" ON public.premissas
      FOR SELECT USING (empresa_id = public.meu_empresa_id()); $p$;
    EXECUTE $p$ CREATE POLICY "premissas_write_diretor" ON public.premissas
      FOR ALL USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor'); $p$;
  END IF;

  -- units (filiais)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='units') THEN
    ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "units_select_empresa" ON public.units;
    DROP POLICY IF EXISTS "units_write_empresa"  ON public.units;
    EXECUTE $p$ CREATE POLICY "units_select_empresa" ON public.units
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.clientes c WHERE c.id = units.customer_id AND c.empresa_id = public.meu_empresa_id()
      )); $p$;
    EXECUTE $p$ CREATE POLICY "units_write_empresa" ON public.units
      FOR ALL USING (EXISTS (
        SELECT 1 FROM public.clientes c WHERE c.id = units.customer_id AND c.empresa_id = public.meu_empresa_id()
      )); $p$;
  END IF;

END $$;
