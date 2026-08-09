-- Alerta de seguranca do Supabase: view public.clients criada sem security_invoker,
-- entao ela roda com o privilegio de quem CRIOU a view (pode ignorar RLS das tabelas
-- por baixo) em vez do privilegio de quem esta consultando. Nao ha nenhuma referencia a
-- essa view em nenhum lugar do codigo (a tabela realmente usada e "clientes", em
-- portugues) -- e provavelmente um artefato antigo/nao utilizado.
--
-- Fix nao destrutivo: liga security_invoker, que faz a view respeitar o RLS de quem
-- consulta. Nao apaga a view (caso exista algum uso externo que eu nao veja no codigo).
ALTER VIEW IF EXISTS public.clients SET (security_invoker = true);
