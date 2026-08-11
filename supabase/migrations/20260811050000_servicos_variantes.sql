-- Variantes de produto (tamanho/cor/sabor) sem duplicar cadastro completo por combinação.
-- Decisão de design: cada variante continua sendo uma linha normal de servicos (mesmo nome
-- completo tipo "Camisa Polo Azul - P"), só ganha um produto_pai_id apontando pro produto
-- base. Isso é aditivo — carrinho, relatórios, leads.itens, THOR/Max continuam lendo nome
-- como string plana, sem precisar mudar nada disso. O que muda é só a tela de cadastro,
-- que passa a agrupar variantes visualmente e oferecer "criar variante" clonando os campos
-- em comum em vez de recadastrar tudo.
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS produto_pai_id bigint REFERENCES public.servicos(id) ON DELETE SET NULL;
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS variante_nome text;
CREATE INDEX IF NOT EXISTS servicos_produto_pai_id_idx ON public.servicos(produto_pai_id);
