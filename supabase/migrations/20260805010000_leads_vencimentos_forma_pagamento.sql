-- Permite editar o vencimento de cada parcela individualmente (em vez de só calcular
-- 1 mês de diferença a partir do 1º vencimento) e registrar a forma de pagamento
-- (boleto, dinheiro, pix, cartão, transferência) usada no contrato.
alter table public.leads
  add column if not exists vencimentos_datas jsonb,
  add column if not exists forma_pagamento text;

comment on column public.leads.vencimentos_datas is 'Array JSON de datas (YYYY-MM-DD), uma por parcela. Quando ausente ou com tamanho diferente de "parcelas", o app recai no cálculo automático (1 mês por parcela a partir de "vencimento").';
comment on column public.leads.forma_pagamento is 'boleto | dinheiro | pix | cartao | transferencia';
