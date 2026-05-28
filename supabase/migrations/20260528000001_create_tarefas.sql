CREATE TABLE IF NOT EXISTS public.tarefas (
  id         bigint  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  titulo     text    NOT NULL,
  data       date    NOT NULL,
  concluido  boolean DEFAULT false,
  user_id    uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  empresa_id uuid    NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_select_empresa" ON public.tarefas
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "tarefas_insert_empresa" ON public.tarefas
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "tarefas_update_empresa" ON public.tarefas
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id())
  WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "tarefas_delete_empresa" ON public.tarefas
  FOR DELETE USING (empresa_id = public.meu_empresa_id() AND user_id = auth.uid());

CREATE INDEX IF NOT EXISTS tarefas_user_id_idx    ON public.tarefas(user_id);
CREATE INDEX IF NOT EXISTS tarefas_data_idx       ON public.tarefas(data);
CREATE INDEX IF NOT EXISTS tarefas_empresa_id_idx ON public.tarefas(empresa_id);
