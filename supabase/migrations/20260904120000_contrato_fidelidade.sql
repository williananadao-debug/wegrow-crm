-- Persiste a fidelidade escolhida no último contrato gerado — sem isso, reabrir o
-- formulário pra corrigir um dado (endereço, CNPJ etc.) e gerar de novo reseta a
-- fidelidade pro padrão (12 meses) da tela, mesmo que o contrato original tivesse sido
-- gerado com outro valor (ou sem fidelidade). Achado ao revisar o fluxo de edição do
-- contrato da Trailer Travel.
alter table public.clientes_wegrow
  add column if not exists contrato_fidelidade_meses integer;
