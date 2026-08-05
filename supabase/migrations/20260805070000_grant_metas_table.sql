-- A tabela public.metas foi criada fora das migrations rastreadas (provavelmente direto
-- pelo SQL Editor) sem os GRANTs padrao que o Supabase costuma aplicar automaticamente.
-- Resultado: nenhuma role consegue ler/escrever nela -- nem authenticated (RLS nunca chega
-- a rodar, pois o Postgres barra no GRANT antes), nem o service_role (que ignora RLS mas
-- ainda precisa do GRANT basico da tabela). Confirmado via teste direto: leads/premissas
-- funcionam com service_role, metas retorna "permission denied for table metas".
--
-- Efeito em cascata: toda query a metas falha silenciosamente (try/catch engole o erro),
-- entao a barra de "Meta Mes (Global)" em /deals sempre trata a meta como 0 e cai no
-- fallback de dividir por 1 -- qualquer faturamento estoura pra 100%. A tela /goals
-- tambem depende dessa tabela pra tudo.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas TO authenticated, service_role;

-- Cobre a sequence do id (bigserial), caso ela tambem esteja sem GRANT.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
