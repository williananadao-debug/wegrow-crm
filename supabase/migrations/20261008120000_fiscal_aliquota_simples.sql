-- Alíquota efetiva do Simples Nacional (muda todo mês, conforme o faturamento dos últimos
-- 12 meses). Usada no crédito de ICMS (CSOSN 101) quando o cliente tem inscrição estadual.
-- O diretor atualiza em Notas Fiscais → "Alíquota do Simples".
ALTER TABLE public.fiscal_integracoes ADD COLUMN IF NOT EXISTS aliquota_simples numeric(5,2);

-- Trailer Travel: 3,83% informado pela contabilidade em 08/10/2026.
UPDATE public.fiscal_integracoes fi
SET aliquota_simples = 3.83
FROM public.empresas e
WHERE e.id = fi.empresa_id
  AND regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125';
