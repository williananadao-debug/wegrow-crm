-- Lei 12.741/2012 ("De olho no imposto"): percentual aproximado de tributos (tabela IBPT) que
-- sai nas notas de venda (valor_total_tributos + texto nas informações complementares).
-- O diretor define em Notas Fiscais → "% Simples / IBPT". Vazio = não informa.
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS tributos_aprox_percentual numeric(5,2);
