-- Exclusão de item do estoque pela tela de Estoque (Detalhe do produto). A RLS de servicos só deixa
-- o diretor escrever; aqui libera também gerente e almoxarifado, só pra excluir e só da própria
-- empresa. Item já usado em produção/ficha técnica/requisição (FK RESTRICT) não exclui — o erro
-- volta pra tela, que explica.

CREATE OR REPLACE FUNCTION public.excluir_item_estoque(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.meu_cargo() NOT IN ('diretor', 'gerente', 'almoxarifado') THEN
    RAISE EXCEPTION 'Sem permissão para excluir item do estoque.';
  END IF;
  DELETE FROM public.servicos WHERE id = p_id AND empresa_id = public.meu_empresa_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_item_estoque(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.excluir_item_estoque(bigint) TO authenticated;
