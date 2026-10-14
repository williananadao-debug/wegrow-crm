-- Corrige "permission denied for table eleicao_cache": tabela criada pelo SQL Editor sem
-- os GRANTs padrão. Só a service role (rotas /api/eleicao) acessa; RLS segue ligada.
GRANT SELECT, INSERT, UPDATE ON public.eleicao_cache TO service_role;
