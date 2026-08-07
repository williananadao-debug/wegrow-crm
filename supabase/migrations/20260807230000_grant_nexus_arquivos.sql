-- Mesmo bug ja visto em metas (ver 20260805070000_grant_metas_table.sql): tabela criada
-- via SQL Editor nao ganha os GRANTs padrao que o Supabase costuma aplicar sozinho quando
-- a tabela nasce pelo dashboard. RLS nunca chega a rodar -- o Postgres barra no GRANT antes
-- disso. Confirmado: upload no Nexus retornava "permission denied for table nexus_arquivos".
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nexus_arquivos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
