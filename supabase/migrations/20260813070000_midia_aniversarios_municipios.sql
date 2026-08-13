-- Aniversários de município por praça atendida — pra alertar o time comercial com
-- antecedência e vender o pacote de aniversário (mesma lógica da aba "Aniversários"
-- do painel da IAlto). Dia/mês (não guarda ano — data recorrente todo ano).
CREATE TABLE IF NOT EXISTS public.midia_aniversarios_municipios (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id    uuid        NOT NULL,
  municipio     text        NOT NULL,
  uf            text,
  praca         text,
  dia           int         NOT NULL CHECK (dia BETWEEN 1 AND 31),
  mes           int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  observacao    text,
  ativo         boolean     NOT NULL DEFAULT true,
  criado_por    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.midia_aniversarios_municipios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "midia_aniversarios_select_empresa" ON public.midia_aniversarios_municipios;
DROP POLICY IF EXISTS "midia_aniversarios_write_lideranca" ON public.midia_aniversarios_municipios;
DROP POLICY IF EXISTS "midia_aniversarios_update_lideranca" ON public.midia_aniversarios_municipios;
DROP POLICY IF EXISTS "midia_aniversarios_delete_lideranca" ON public.midia_aniversarios_municipios;

CREATE POLICY "midia_aniversarios_select_empresa" ON public.midia_aniversarios_municipios
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "midia_aniversarios_write_lideranca" ON public.midia_aniversarios_municipios
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_aniversarios_update_lideranca" ON public.midia_aniversarios_municipios
  FOR UPDATE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_aniversarios_delete_lideranca" ON public.midia_aniversarios_municipios
  FOR DELETE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

CREATE INDEX IF NOT EXISTS midia_aniversarios_empresa_idx ON public.midia_aniversarios_municipios(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.midia_aniversarios_municipios TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
