-- A rota "Excluir venda" (server, service_role) apaga produção, eventos e movimentações de estoque.
-- Essas tabelas foram criadas com GRANT só de SELECT/INSERT — falta DELETE (e UPDATE) pro service_role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_producoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_producao_eventos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_producao_itens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_movimentacoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO service_role;
