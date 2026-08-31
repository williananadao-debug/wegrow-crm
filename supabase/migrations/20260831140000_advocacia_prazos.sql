-- Prazos processuais (audiência, recurso, contestação, etc.) — um processo tem vários ao
-- longo da vida, por isso é tabela própria (1 linha por prazo), não uma data única no
-- processo. Alimenta o alerta no Painel/Dashboard, mesmo padrão do vencimento de
-- documento em Veículos (leads_veiculo_documentos.data_vencimento).
CREATE TABLE IF NOT EXISTS public.advocacia_prazos (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id    uuid        NOT NULL,
  processo_id   bigint      NOT NULL REFERENCES public.advocacia_processos(id) ON DELETE CASCADE,
  titulo        text        NOT NULL,
  data_prazo    date        NOT NULL,
  concluido     boolean     NOT NULL DEFAULT false,
  criado_por    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.advocacia_prazos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advocacia_prazos_select_empresa" ON public.advocacia_prazos;
DROP POLICY IF EXISTS "advocacia_prazos_insert_empresa" ON public.advocacia_prazos;
DROP POLICY IF EXISTS "advocacia_prazos_update_empresa" ON public.advocacia_prazos;
DROP POLICY IF EXISTS "advocacia_prazos_delete_empresa" ON public.advocacia_prazos;

CREATE POLICY "advocacia_prazos_select_empresa" ON public.advocacia_prazos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_prazos_insert_empresa" ON public.advocacia_prazos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_prazos_update_empresa" ON public.advocacia_prazos
  FOR UPDATE USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_prazos_delete_empresa" ON public.advocacia_prazos
  FOR DELETE USING (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS advocacia_prazos_processo_id_idx ON public.advocacia_prazos(processo_id);
CREATE INDEX IF NOT EXISTS advocacia_prazos_empresa_id_idx ON public.advocacia_prazos(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.advocacia_prazos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
