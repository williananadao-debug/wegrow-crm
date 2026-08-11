-- Generaliza o kardex (antes só logava entrada por nota fiscal) pra também registrar
-- ajuste manual (+/-), venda e estorno — histórico completo de por que o estoque de um
-- produto mudou, não só a parte que veio de nota fiscal. quantidade passa a ser assinada
-- (negativa em saída) pra dar pra somar e conferir o saldo depois, se precisar.
ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'entrada_nf';
ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS observacao text;
