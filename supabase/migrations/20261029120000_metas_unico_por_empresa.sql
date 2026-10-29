-- "metas_periodo_unico" não tinha empresa_id: a meta global (user_id NULL) de um mês só podia
-- existir em UMA empresa do banco inteiro. A 2ª empresa a salvar a meta de jan/2026 batia na
-- linha da outra (apareceu ao carregar a demo da RBN). Agora a unicidade é por empresa.
-- RODAR ANTES do deploy do código que usa onConflict com empresa_id (tela de Metas).
ALTER TABLE public.metas DROP CONSTRAINT IF EXISTS metas_periodo_unico;
ALTER TABLE public.metas ADD CONSTRAINT metas_periodo_unico
  UNIQUE NULLS NOT DISTINCT (empresa_id, user_id, ano, mes, produto, unidade);
