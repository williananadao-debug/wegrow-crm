-- Referência simples de veículo no lead (loja de carros) — texto livre, sem tabela de
-- estoque própria. Decisão: WeGrow não compete com ferramentas dedicadas de vitrine/estoque
-- de veículo (ex: Click Garage) — fica só como informação de gestão dentro do CRM.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_referencia text;
