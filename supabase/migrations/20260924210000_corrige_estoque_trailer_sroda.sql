-- Bug corrigido no código (commit 7a842f2): "Dar saída por Nota Fiscal" gravava estoque=0
-- em produto sob encomenda (estoque null) por causa de "null || 0" na conta. Foi exatamente
-- o que aconteceu com o servico 356 (TRAILER SRODA DIAMOND HOUSE 8.0) — confirmado por
-- SELECT (estoque=0, estoque_minimo=5, sem produto_pai_id, ou seja, não é variante: nasceu
-- sob encomenda e foi virado "produto de estoque zerado" por engano na primeira NF de saída
-- lançada pra ele). Volta pra NULL = sob encomenda de novo (mesma regra de
-- nova-venda/page.tsx: ehSobEncomenda = estoque === null).
-- Guarda de segurança (estoque = 0) pra não sobrescrever se alguém já tiver corrigido, ou se
-- o produto genuinamente virou um item de estoque de verdade nesse meio tempo.
UPDATE public.servicos
SET estoque = NULL
WHERE id = 356 AND estoque = 0;
