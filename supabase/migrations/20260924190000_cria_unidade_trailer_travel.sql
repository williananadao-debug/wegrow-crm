-- Descoberto pelo diagnóstico anterior (20260924150000_dados_unidade_trailer_travel.sql
-- não achou nenhuma linha pra atualizar): a Trailer Travel nunca teve NENHUMA linha em
-- "unidades" — não era só razao_social/cnpj vazios, a tabela inteira estava sem registro
-- pra essa empresa. Por isso o contrato saía com CONTRATADA/CNPJ em branco: o código
-- (docuseal/pulse/route.ts) busca a unidade e, sem nenhuma linha, usa string vazia em tudo.
-- A migration anterior fica registrada no histórico, mas não fez nada — esta aqui resolve
-- de fato, criando a unidade (só se ainda não existir nenhuma, seguro rodar de novo).
INSERT INTO public.unidades (empresa_id, nome, razao_social, cnpj, endereco, cidade, estado)
SELECT e.id, 'Matriz', 'MOTORHOME TREILER TRAVEL LTDA', '55.496.506/0001-25',
       'Rua Santo Antonio, S/N, Galpão, Bairro Santo Antonio, CEP 89190-000', 'Taió', 'SC'
FROM public.empresas e
WHERE e.nome ILIKE '%Trailer Travel%'
  AND NOT EXISTS (SELECT 1 FROM public.unidades u WHERE u.empresa_id = e.id);
