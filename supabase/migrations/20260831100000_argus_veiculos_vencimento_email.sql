-- Data de vencimento por documento (CRLV, laudo cautelar) — alimenta o alerta de
-- "documento vencendo" no Dashboard. Também guarda e-mail do comprador em `leads`,
-- necessário pra emissão de contrato de compra e venda via assinatura digital
-- (Docuseal manda o link de assinatura por e-mail).
ALTER TABLE public.leads_veiculo_documentos ADD COLUMN IF NOT EXISTS data_vencimento date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email text;
