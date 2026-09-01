-- Gestão de tarefas por processo — Prazos (advocacia_prazos) cobre só "data + concluído",
-- sem responsável nem prioridade. Tarefa é o próximo degrau: responsável individual,
-- prioridade e status (não só concluído/pendente), pra dar pra montar uma visão "minhas
-- tarefas" cruzando todos os processos de um advogado — o que Prazos não permitia porque
-- não tinha responsável próprio, só o do processo inteiro. Templates de rotina por área
-- jurídica ficam pra uma fase 2, de propósito.
CREATE TABLE IF NOT EXISTS public.advocacia_tarefas (
  id              bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id      uuid        NOT NULL,
  processo_id     bigint      NOT NULL REFERENCES public.advocacia_processos(id) ON DELETE CASCADE,
  titulo          text        NOT NULL,
  descricao       text,
  responsavel_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  prioridade      text        NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  status          text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida')),
  data_prevista   date,
  concluida_em    timestamptz,
  criado_por      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.advocacia_tarefas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advocacia_tarefas_select_empresa" ON public.advocacia_tarefas;
DROP POLICY IF EXISTS "advocacia_tarefas_insert_empresa" ON public.advocacia_tarefas;
DROP POLICY IF EXISTS "advocacia_tarefas_update_empresa" ON public.advocacia_tarefas;
DROP POLICY IF EXISTS "advocacia_tarefas_delete_empresa" ON public.advocacia_tarefas;

CREATE POLICY "advocacia_tarefas_select_empresa" ON public.advocacia_tarefas
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_tarefas_insert_empresa" ON public.advocacia_tarefas
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_tarefas_update_empresa" ON public.advocacia_tarefas
  FOR UPDATE USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_tarefas_delete_empresa" ON public.advocacia_tarefas
  FOR DELETE USING (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS advocacia_tarefas_processo_id_idx ON public.advocacia_tarefas(processo_id);
CREATE INDEX IF NOT EXISTS advocacia_tarefas_empresa_id_idx ON public.advocacia_tarefas(empresa_id);
CREATE INDEX IF NOT EXISTS advocacia_tarefas_responsavel_id_idx ON public.advocacia_tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS advocacia_tarefas_status_idx ON public.advocacia_tarefas(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.advocacia_tarefas TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
