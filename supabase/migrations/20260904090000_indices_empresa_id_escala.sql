-- ============================================================
-- Índices em empresa_id nas tabelas mais centrais e mais consultadas
-- do sistema (leads, clientes, servicos, lancamentos) — hoje sem
-- índice, rodando como table scan completo em toda query filtrada
-- por empresa_id e em toda checagem de RLS (meu_empresa_id()).
--
-- Sem CONCURRENTLY de propósito: o SQL Editor do Supabase sempre roda
-- dentro de uma transação implícita, e CONCURRENTLY não é permitido
-- ali (erro 25001). Um CREATE INDEX comum toma lock de escrita só
-- durante a construção — nas tabelas atuais (poucas dezenas de
-- tenants) isso é da ordem de milissegundos, sem impacto perceptível.
-- Se um dia rodar via CLI/psql direto fora do SQL Editor, pode trocar
-- por CONCURRENTLY sem problema.
-- ============================================================

CREATE INDEX IF NOT EXISTS leads_empresa_id_idx
  ON public.leads (empresa_id);

CREATE INDEX IF NOT EXISTS clientes_empresa_id_idx
  ON public.clientes (empresa_id);

CREATE INDEX IF NOT EXISTS servicos_empresa_id_idx
  ON public.servicos (empresa_id);

CREATE INDEX IF NOT EXISTS lancamentos_empresa_id_idx
  ON public.lancamentos (empresa_id);
