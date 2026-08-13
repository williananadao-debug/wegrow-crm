-- Resultado de venda do aniversário de cada município, por ano — a data em si
-- (dia/mês) é recorrente e fica em midia_aniversarios_municipios; o status comercial
-- (vendido/não vendido/sem registro) muda ano a ano, por isso é tabela separada.
CREATE TABLE IF NOT EXISTS public.midia_aniversarios_resultados (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  aniversario_id bigint      NOT NULL REFERENCES public.midia_aniversarios_municipios(id) ON DELETE CASCADE,
  ano            int         NOT NULL,
  status         text        NOT NULL DEFAULT 'sem_registro'
                   CHECK (status IN ('nao_vendido','sem_registro','vendido','vendido_sem_valor')),
  valor          numeric,
  observacao     text,
  criado_por     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aniversario_id, ano)
);

ALTER TABLE public.midia_aniversarios_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "midia_aniv_resultados_select_empresa" ON public.midia_aniversarios_resultados;
DROP POLICY IF EXISTS "midia_aniv_resultados_write_lideranca" ON public.midia_aniversarios_resultados;
DROP POLICY IF EXISTS "midia_aniv_resultados_update_lideranca" ON public.midia_aniversarios_resultados;
DROP POLICY IF EXISTS "midia_aniv_resultados_delete_lideranca" ON public.midia_aniversarios_resultados;

CREATE POLICY "midia_aniv_resultados_select_empresa" ON public.midia_aniversarios_resultados
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "midia_aniv_resultados_write_lideranca" ON public.midia_aniversarios_resultados
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_aniv_resultados_update_lideranca" ON public.midia_aniversarios_resultados
  FOR UPDATE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_aniv_resultados_delete_lideranca" ON public.midia_aniversarios_resultados
  FOR DELETE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

CREATE INDEX IF NOT EXISTS midia_aniv_resultados_aniversario_idx ON public.midia_aniversarios_resultados(aniversario_id);
CREATE INDEX IF NOT EXISTS midia_aniv_resultados_empresa_ano_idx ON public.midia_aniversarios_resultados(empresa_id, ano);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.midia_aniversarios_resultados TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
