-- Saída de estoque gerada por venda só guardava o número da OS dentro de um texto livre
-- (observacao: "Venda Pulse — OS LD-0042") — dava pra achar procurando o texto, mas não
-- dava pra consultar/filtrar de verdade "tudo que saiu por causa da venda X". Coluna
-- estruturada resolve isso — mesmo padrão que producao_id já tinha pra produção.
ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS lead_id bigint REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS estoque_movimentacoes_lead_id_idx ON public.estoque_movimentacoes(lead_id);
