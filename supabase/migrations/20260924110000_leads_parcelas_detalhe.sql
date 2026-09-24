-- Parcelas com valor e data PRÓPRIOS por linha (carnê), em vez de só "N parcelas iguais".
-- Caso real: Trailer Travel vende com entrada + parcelas de valores DIFERENTES entre si
-- (ex: entrada 56.970 + 5x 15.000 + 1 parcela final de 57.930) — o modelo antigo (parcelas
-- + vencimento inicial, saldo dividido igualmente) não representa isso.
-- Null/vazio = comportamento antigo continua valendo (parcelas iguais calculadas na hora).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS parcelas_detalhe jsonb;
