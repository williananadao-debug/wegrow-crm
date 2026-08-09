-- Alerta de seguranca do Supabase: 5 tabelas em public sem RLS habilitado, totalmente
-- acessiveis por qualquer um com a anon key (que e publica, embutida no bundle do site).

-- ============================================================
-- Tabelas sem nenhuma referencia no codigo atual (legado/abandonadas).
-- So habilita RLS, sem nenhuma policy -> ninguem acessa, nada quebra (nada as usa).
-- ============================================================
ALTER TABLE IF EXISTS public.historico_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.perfis          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- unidades_cidades: tabela normal do CRM multi-tenant (mapeamento de cidades por
-- unidade), usada em dashboard/premises. Mesmo padrao ja usado em metas/leads/visitas.
-- ============================================================
ALTER TABLE public.unidades_cidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unidades_cidades_select_empresa" ON public.unidades_cidades;
DROP POLICY IF EXISTS "unidades_cidades_write_diretor"  ON public.unidades_cidades;

CREATE POLICY "unidades_cidades_select_empresa" ON public.unidades_cidades
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "unidades_cidades_write_diretor" ON public.unidades_cidades
  FOR ALL
  USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor')
  WITH CHECK (empresa_id = public.meu_empresa_id() AND public.meu_cargo() = 'diretor');

-- ============================================================
-- clientes_wegrow: NAO e tenant-scoped -- e o faturamento interno da propria WeGrow
-- sobre seus clientes (a tabela "empresas"). So o admin da plataforma (Willian) pode
-- ver. Espelha o mesmo e-mail hardcoded em NEXT_PUBLIC_ADMIN_EMAILS -- se adicionar mais
-- admins la, precisa atualizar aqui tambem.
-- ============================================================
ALTER TABLE public.clientes_wegrow ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_wegrow_admin_only" ON public.clientes_wegrow;

CREATE POLICY "clientes_wegrow_admin_only" ON public.clientes_wegrow
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'willian.anadao@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'willian.anadao@gmail.com');
