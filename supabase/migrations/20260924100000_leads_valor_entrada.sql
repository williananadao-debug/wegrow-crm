-- Entrada opcional, paga separado do saldo parcelado (ex: 30% via boleto no fechamento,
-- saldo em 7-8 parcelas — pedido da Biomaq/venda de equipamento). Sem essas colunas, o
-- contrato só tinha "Forma de Pagamento" + "Parcelas" únicos pro valor total inteiro,
-- perdendo a distinção entrada×saldo que o vendedor negocia.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS valor_entrada numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS forma_pagamento_entrada text;
