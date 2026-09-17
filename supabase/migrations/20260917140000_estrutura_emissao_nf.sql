-- Estrutura pra emissão de NF-e de saída (venda para entrega futura, CFOP 5922 + 5116/6116)
-- via Focus NFe. Isso SIM é schema (novas colunas) — pode ficar como migration de verdade,
-- não tem dado pessoal sensível.

-- 1) NCM por produto — mesmo NCM (87161000, trailer) pra todos os modelos de trailer,
-- confirmado pelo cliente.
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS ncm text;

UPDATE servicos SET ncm = '87161000'
WHERE empresa_id = (SELECT id FROM empresas WHERE nome ILIKE '%Trailer Travel%' LIMIT 1)
  AND tipo = 'Trailer sob encomenda' AND ncm IS NULL;

-- 2) Dados fiscais do emitente — necessários pra montar o payload de emissão (endereço,
-- IE, IM, regime tributário). fiscal_integracoes já tinha token/ambiente/regime_tributario
-- (texto livre, espelhando o Focus NFe) — faltavam os campos de cadastro em si.
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS ie text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS im text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS numero text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS municipio text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS codigo_municipio text; -- código IBGE
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS email text;

-- 3) fiscal_notas — vincula a NF emitida por nós à venda (lead) que a originou, e guarda a
-- chave da nota referenciada (NF2 referencia a chave da NF1, no "venda para entrega futura").
ALTER TABLE public.fiscal_notas ADD COLUMN IF NOT EXISTS lead_id bigint;
ALTER TABLE public.fiscal_notas ADD COLUMN IF NOT EXISTS chave_nf_referenciada text;
ALTER TABLE public.fiscal_notas ADD COLUMN IF NOT EXISTS ref_focus_nfe text; -- "ref" que mandamos pro Focus NFe, pra casar a resposta do webhook

CREATE INDEX IF NOT EXISTS fiscal_notas_lead_id_idx ON public.fiscal_notas(lead_id);
CREATE INDEX IF NOT EXISTS fiscal_notas_ref_focus_nfe_idx ON public.fiscal_notas(ref_focus_nfe);
