-- Nota capturada automática (webhook do Focus NFe) até aqui só gravava fiscal_notas —
-- não aparecia em Financeiro como conta a pagar, diferente da nota lançada na mão
-- (NotaFiscalModal), que sempre criou lancamentos junto. Sem link nenhum entre as duas.
--
-- Sem coluna de FK pra lancamentos de propósito: essa tabela não passou pelo tracker de
-- migrations (existe desde antes), o tipo exato do id não está confirmado aqui — melhor
-- guardar a referência solta (sem constraint) do que arriscar a migration falhar por
-- incompatibilidade de tipo.
ALTER TABLE public.fiscal_notas ADD COLUMN IF NOT EXISTS lancamento_id bigint;

CREATE INDEX IF NOT EXISTS fiscal_notas_lancamento_id_idx ON public.fiscal_notas(lancamento_id);
