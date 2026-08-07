-- ============================================================
-- NEXUS: memoria pesquisavel de arquivos por cliente (fotos, documentos,
-- layouts 3D, manutencoes). Modulo pensado pra empresas onde o time comercial
-- nao adota CRM/pipeline, mas ainda tem dor real de organizar historico de
-- equipamento — quem alimenta e producao/pos-venda, nao o vendedor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nexus_arquivos (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id    uuid        NOT NULL,
  client_id     bigint      NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  categoria     text        NOT NULL CHECK (categoria IN ('foto', 'documento', 'layout3d', 'manutencao')),
  titulo        text        NOT NULL,
  tags          text[]      NOT NULL DEFAULT '{}',
  arquivo_url   text        NOT NULL,
  arquivo_path  text        NOT NULL,
  responsavel_nome text,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nexus_arquivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus_arquivos_select_empresa" ON public.nexus_arquivos;
DROP POLICY IF EXISTS "nexus_arquivos_insert_empresa" ON public.nexus_arquivos;
DROP POLICY IF EXISTS "nexus_arquivos_delete_empresa" ON public.nexus_arquivos;

CREATE POLICY "nexus_arquivos_select_empresa" ON public.nexus_arquivos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "nexus_arquivos_insert_empresa" ON public.nexus_arquivos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "nexus_arquivos_delete_empresa" ON public.nexus_arquivos
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() = 'diretor' OR user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS nexus_arquivos_client_id_idx  ON public.nexus_arquivos(client_id);
CREATE INDEX IF NOT EXISTS nexus_arquivos_empresa_id_idx ON public.nexus_arquivos(empresa_id);

-- Bucket publico (mesma lógica do bucket "visitas": leitura via URL publica,
-- upload restrito por policy abaixo).
INSERT INTO storage.buckets (id, name, public)
VALUES ('nexus', 'nexus', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "nexus_bucket_insert_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "nexus_bucket_delete_mesma_empresa" ON storage.objects;

CREATE POLICY "nexus_bucket_insert_mesma_empresa"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nexus'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "nexus_bucket_delete_mesma_empresa"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'nexus'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);
