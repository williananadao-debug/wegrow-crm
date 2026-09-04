-- ============================================================
-- Índices em empresa_id nas tabelas mais centrais e mais consultadas
-- do sistema (leads, clientes, servicos, lancamentos) — hoje sem
-- índice, rodando como table scan completo em toda query filtrada
-- por empresa_id e em toda checagem de RLS (meu_empresa_id()).
--
-- CONCURRENTLY não bloqueia escrita durante a criação, mas não pode
-- rodar dentro de uma transação — execute os 4 comandos como
-- statements separados (não selecione tudo e rode de uma vez se o
-- seu client agrupar em BEGIN/COMMIT automático).
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_empresa_id_idx
  ON public.leads (empresa_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS clientes_empresa_id_idx
  ON public.clientes (empresa_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS servicos_empresa_id_idx
  ON public.servicos (empresa_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS lancamentos_empresa_id_idx
  ON public.lancamentos (empresa_id);
