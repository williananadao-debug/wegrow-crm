-- Dados jurídicos do cliente (razão social, CNPJ, endereço) — precisos pra gerar o
-- contrato de serviço automaticamente (Cláusula "Contratante"). Preenchidos uma vez na
-- aba Contrato, ficam salvos pro cliente.
alter table public.clientes_wegrow
  add column if not exists razao_social text,
  add column if not exists cnpj text,
  add column if not exists endereco text;
