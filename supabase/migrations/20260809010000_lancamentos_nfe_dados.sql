-- Dados da nota fiscal de fornecedor (número, série, chave de acesso, emissão,
-- CNPJ do emitente), capturados na leitura por foto (/pulse/estoque, THOR) e
-- gravados junto com a despesa em Contas a Pagar pra rastreabilidade/auditoria.
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS nf_numero text;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS nf_serie text;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS nf_chave_acesso text;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS nf_data_emissao date;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS nf_fornecedor_cnpj text;
