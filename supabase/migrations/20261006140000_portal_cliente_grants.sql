-- Corrige "permission denied" ao gravar link/sessão do Portal do Cliente: as tabelas foram
-- criadas sem GRANT pro service_role (mesmo problema que já aconteceu com visitas). RLS
-- continua ligado e sem policy — anon/authenticated seguem sem acesso nenhum.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_cliente_tokens  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_cliente_sessoes TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
