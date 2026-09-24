-- O contrato do Pulse (contract-trailer-pdf.ts) usa a tabela "unidades" (razao_social, cnpj,
-- endereco, cidade, estado) pra preencher CONTRATADA/rodapé/foro — mas essa tabela nunca foi
-- populada pra Trailer Travel (só fiscal_integracoes tinha os dados fiscais, usados na NF).
-- Resultado: contrato saía com CNPJ em branco, rodapé sem nome/CNPJ da empresa e "foro da
-- Comarca de ___________" em branco (cai em data.vendedora_cidade/estado, que estava null).
-- Dados extraídos do contrato real da empresa (mesmo CNPJ/IE/endereço já usados na migration
-- de emissão de NF, 20260917150000_dados_emitente_trailer_travel.sql).
UPDATE public.unidades SET
  razao_social = 'MOTORHOME TREILER TRAVEL LTDA',
  cnpj = '55.496.506/0001-25',
  endereco = 'Rua Santo Antonio, S/N, Galpão, Bairro Santo Antonio, CEP 89190-000',
  cidade = 'Taió',
  estado = 'SC'
WHERE empresa_id = (SELECT id FROM empresas WHERE nome ILIKE '%Trailer Travel%' LIMIT 1)
  AND (razao_social IS NULL OR razao_social = '' OR cnpj IS NULL OR cnpj = '');
