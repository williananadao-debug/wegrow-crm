-- Exclusao de visitas restrita a diretor (antes tambem permitia o proprio vendedor
-- apagar suas visitas — vendedor nao deve poder apagar historico de visita, so o admin).
DROP POLICY IF EXISTS "visitas_delete_empresa" ON public.visitas;

CREATE POLICY "visitas_delete_empresa" ON public.visitas
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() = 'diretor'
  );
