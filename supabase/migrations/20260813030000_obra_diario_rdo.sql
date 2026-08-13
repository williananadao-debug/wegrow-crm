-- RDO — Diário de Obra. Item 2 do plano de fechar gap com o Sienge.
-- Bucket 'obras-arquivos' é criado aqui mas pensado pra ser reaproveitado
-- também pelo item de Engenharia/documentos técnicos (mesmo padrão de
-- upload, só muda a tabela que referencia o arquivo). Padrão de upload/RLS
-- copiado de nexus_arquivos (20260807210000_nexus_arquivos.sql) — inclui
-- a política de INSERT/DELETE na MESMA migration que cria o bucket, porque
-- o bucket "visitas" ficou meses sem política e todo upload falhava calado.
-- Ver C:\Users\willi\.claude\plans\cozy-percolating-snail.md

CREATE TABLE IF NOT EXISTS public.obra_diario_entradas (
  id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id   uuid        NOT NULL,
  obra_id      bigint      NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  data         date        NOT NULL DEFAULT CURRENT_DATE,
  efetivo      int,
  clima        text,
  ocorrencias  text,
  fotos        jsonb       NOT NULL DEFAULT '[]', -- [{url, path, nome}]
  criado_por   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_diario_entradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obra_diario_entradas_select_empresa" ON public.obra_diario_entradas;
DROP POLICY IF EXISTS "obra_diario_entradas_write_empresa" ON public.obra_diario_entradas;

-- Registro de campo — qualquer um da empresa pode lançar/editar (não é
-- decisão financeira como medição, é fato de obra), sem restringir a diretor/gerente.
CREATE POLICY "obra_diario_entradas_select_empresa" ON public.obra_diario_entradas
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "obra_diario_entradas_write_empresa" ON public.obra_diario_entradas
  FOR ALL USING (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS obra_diario_entradas_obra_id_idx ON public.obra_diario_entradas(obra_id);
CREATE INDEX IF NOT EXISTS obra_diario_entradas_empresa_id_idx ON public.obra_diario_entradas(empresa_id);
CREATE INDEX IF NOT EXISTS obra_diario_entradas_data_idx ON public.obra_diario_entradas(data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_diario_entradas TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ── Bucket de arquivos de obra (RDO + Engenharia/documentos, item futuro) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('obras-arquivos', 'obras-arquivos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "obras_arquivos_select_publico" ON storage.objects;
DROP POLICY IF EXISTS "obras_arquivos_insert_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "obras_arquivos_delete_mesma_empresa" ON storage.objects;

CREATE POLICY "obras_arquivos_select_publico" ON storage.objects
  FOR SELECT USING (bucket_id = 'obras-arquivos');

CREATE POLICY "obras_arquivos_insert_mesma_empresa" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'obras-arquivos'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
  );

CREATE POLICY "obras_arquivos_delete_mesma_empresa" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'obras-arquivos'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
  );
