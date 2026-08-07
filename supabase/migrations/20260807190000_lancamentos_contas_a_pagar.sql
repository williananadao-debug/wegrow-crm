-- Contas a Pagar: campos novos na tabela lancamentos pra suportar despesas
-- manuais (fornecedor/custo fixo), recorrência mensal e data real de pagamento
-- (distinta de data_vencimento, que já existe).
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_pagamento date;
