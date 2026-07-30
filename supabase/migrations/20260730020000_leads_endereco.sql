-- Endereço do cliente, usado no contrato (padrão Demais FM)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS endereco TEXT DEFAULT NULL;
