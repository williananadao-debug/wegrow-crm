-- Encurtar contrato também pela gerência (12/11/2026): na Demais FM quem acompanha os
-- contratos no dia a dia é o gerente comercial. Continua fora do alcance de vendedores.
DROP POLICY IF EXISTS "vendas_ajustes_insert_diretor" ON public.vendas_ajustes;
DROP POLICY IF EXISTS "vendas_ajustes_insert_lideranca" ON public.vendas_ajustes;
CREATE POLICY "vendas_ajustes_insert_lideranca" ON public.vendas_ajustes
  FOR INSERT WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()) AND (SELECT public.meu_cargo()) IN ('diretor', 'gerente'));
NOTIFY pgrst, 'reload schema';
