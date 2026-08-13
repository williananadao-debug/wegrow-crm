-- Engenharia/documentos técnicos. Item 3 do plano de fechar gap com o Sienge.
-- Reaproveita o bucket 'obras-arquivos' e as políticas de storage já criadas
-- em 20260813030000_obra_diario_rdo.sql — só a tabela é nova aqui.
-- Ver C:\Users\willi\.claude\plans\cozy-percolating-snail.md

CREATE TABLE IF NOT EXISTS public.obra_documentos (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  obra_id        bigint      NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome           text        NOT NULL,
  categoria      text        NOT NULL DEFAULT 'outro'
                   CHECK (categoria IN ('projeto','licenca','contrato','art_rrt','outro')),
  arquivo_url    text        NOT NULL,
  arquivo_path   text        NOT NULL,
  tamanho_bytes  bigint,
  enviado_por    uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obra_documentos_select_empresa" ON public.obra_documentos;
DROP POLICY IF EXISTS "obra_documentos_write_empresa" ON public.obra_documentos;

CREATE POLICY "obra_documentos_select_empresa" ON public.obra_documentos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "obra_documentos_write_empresa" ON public.obra_documentos
  FOR ALL USING (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS obra_documentos_obra_id_idx ON public.obra_documentos(obra_id);
CREATE INDEX IF NOT EXISTS obra_documentos_empresa_id_idx ON public.obra_documentos(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_documentos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
