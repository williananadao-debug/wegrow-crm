-- A rota "Excluir nota fiscal" (server, service_role) apaga a nota e seus itens quando
-- alguém lança uma nota errada por engano. Essas tabelas foram criadas só com
-- SELECT/INSERT/UPDATE — falta DELETE pro service_role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_notas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_notas_itens TO service_role;
