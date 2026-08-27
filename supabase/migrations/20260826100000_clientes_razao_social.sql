-- "Razão social" nunca foi um campo persistido de verdade em `clientes` — só era lido
-- transitoriamente da consulta de CNPJ (ReceitaWS/BrasilAPI) pra calcular nome_empresa, e
-- descartado depois. Isso fazia o contrato de rádio imprimir "Razão Social" e "Nome
-- Fantasia" com o mesmo valor (cliente.empresa), porque não havia de onde tirar os dois
-- separados.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS razao_social text;
