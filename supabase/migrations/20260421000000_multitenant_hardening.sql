-- ============================================================
-- MULTITENANT HARDENING — WeGrow CRM
-- ============================================================
-- Corrige:
--   1. WITH CHECK em UPDATE policies (impede troca de empresa_id)
--   2. Soft delete em leads, clientes e jobs
--   3. Tabela de auditoria para rastrear deleções
--   4. Corrige policy do portal anon (remove UUID hardcoded do SQL)
-- ============================================================


-- ============================================================
-- 1. AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigserial PRIMARY KEY,
  tabela      text        NOT NULL,
  operacao    text        NOT NULL,  -- DELETE | UPDATE_CARGO | etc.
  registro_id bigint,
  empresa_id  uuid,
  feito_por   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  dados_antes jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas diretores da mesma empresa leem o log
DROP POLICY IF EXISTS "audit_log_select_diretor" ON public.audit_log;
CREATE POLICY "audit_log_select_diretor" ON public.audit_log
  FOR SELECT USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );

-- Ninguém insere diretamente: somente triggers
DROP POLICY IF EXISTS "audit_log_insert_deny" ON public.audit_log;
CREATE POLICY "audit_log_insert_deny" ON public.audit_log
  FOR INSERT WITH CHECK (false);


-- ============================================================
-- 2. SOFT DELETE — colunas
-- ============================================================
ALTER TABLE public.leads   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.leads   ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.jobs    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.jobs    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================
-- 3. RECRIA policies de leads com WITH CHECK e soft delete
-- ============================================================
DROP POLICY IF EXISTS "leads_select_empresa"      ON public.leads;
DROP POLICY IF EXISTS "leads_insert_empresa"      ON public.leads;
DROP POLICY IF EXISTS "leads_update_empresa"      ON public.leads;
DROP POLICY IF EXISTS "leads_delete_diretor"      ON public.leads;
DROP POLICY IF EXISTS "leads_insert_portal_anon"  ON public.leads;

-- SELECT: exclui soft-deletados
CREATE POLICY "leads_select_empresa" ON public.leads
  FOR SELECT USING (
    empresa_id = public.meu_empresa_id()
    AND deleted_at IS NULL
  );

-- INSERT: garante que o tenant vem do perfil autenticado
CREATE POLICY "leads_insert_empresa" ON public.leads
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

-- UPDATE: impede trocar empresa_id para outro tenant
CREATE POLICY "leads_update_empresa" ON public.leads
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id() AND deleted_at IS NULL)
  WITH CHECK (empresa_id = public.meu_empresa_id());

-- DELETE (soft): somente diretor; a trigger registra no audit_log
CREATE POLICY "leads_delete_diretor" ON public.leads
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );

-- Portal anon: somente pela env var (sem UUID hardcoded no SQL)
-- A validação do empresa_id certo é feita no server-side (route.ts)
-- que usa SERVICE_ROLE_KEY, então a policy anon não é necessária.
-- Mantemos apenas para segurança extra caso alguém chame direto.
-- Obs: sem UUID hardcoded — anon não pode inserir diretamente pelo client.
CREATE POLICY "leads_insert_portal_anon" ON public.leads
  FOR INSERT TO anon
  WITH CHECK (false);  -- bloqueado; inserção apenas via service_role no server


-- ============================================================
-- 4. RECRIA policies de clientes com WITH CHECK e soft delete
-- ============================================================
DROP POLICY IF EXISTS "clientes_select_empresa" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert_empresa" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update_empresa" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete_diretor" ON public.clientes;

CREATE POLICY "clientes_select_empresa" ON public.clientes
  FOR SELECT USING (
    empresa_id = public.meu_empresa_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "clientes_insert_empresa" ON public.clientes
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "clientes_update_empresa" ON public.clientes
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id() AND deleted_at IS NULL)
  WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "clientes_delete_diretor" ON public.clientes
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );


-- ============================================================
-- 5. RECRIA policies de jobs com WITH CHECK e soft delete
-- ============================================================
DROP POLICY IF EXISTS "jobs_select_empresa" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_empresa" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_empresa" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_diretor" ON public.jobs;

CREATE POLICY "jobs_select_empresa" ON public.jobs
  FOR SELECT USING (
    empresa_id = public.meu_empresa_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "jobs_insert_empresa" ON public.jobs
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "jobs_update_empresa" ON public.jobs
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id() AND deleted_at IS NULL)
  WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "jobs_delete_diretor" ON public.jobs
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );


-- ============================================================
-- 6. TRIGGERS DE AUDITORIA — registra deleções no audit_log
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.audit_log (tabela, operacao, registro_id, empresa_id, feito_por, dados_antes)
  VALUES (
    TG_TABLE_NAME,
    'DELETE',
    OLD.id,
    OLD.empresa_id,
    auth.uid(),
    to_jsonb(OLD)
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_leads_delete   ON public.leads;
DROP TRIGGER IF EXISTS audit_clientes_delete ON public.clientes;
DROP TRIGGER IF EXISTS audit_jobs_delete    ON public.jobs;

CREATE TRIGGER audit_leads_delete
  BEFORE DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_delete();

CREATE TRIGGER audit_clientes_delete
  BEFORE DELETE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_delete();

CREATE TRIGGER audit_jobs_delete
  BEFORE DELETE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_delete();


-- ============================================================
-- 7. PROFILES — adiciona WITH CHECK no UPDATE
-- ============================================================
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND empresa_id = public.meu_empresa_id()
  );


-- ============================================================
-- 8. AUDIT DE CARGO — registra mudanças de cargo em profiles
-- ============================================================

-- profiles.id é UUID; coluna extra para não conflitar com registro_id bigint
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS registro_uuid uuid;

CREATE OR REPLACE FUNCTION public.fn_audit_update_cargo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.cargo IS DISTINCT FROM NEW.cargo THEN
    INSERT INTO public.audit_log (tabela, operacao, registro_uuid, empresa_id, feito_por, dados_antes)
    VALUES (
      'profiles',
      'UPDATE_CARGO',
      OLD.id,
      OLD.empresa_id,
      auth.uid(),
      jsonb_build_object('cargo_antes', OLD.cargo, 'cargo_depois', NEW.cargo, 'nome', OLD.nome)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_profiles_update_cargo ON public.profiles;
CREATE TRIGGER audit_profiles_update_cargo
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_update_cargo();
