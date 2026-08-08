-- Foto do produto (opcional) — usada no picker do Pulse pra reconhecer o item visualmente
-- em vez de só texto. Bucket público, upload feito pelo próprio diretor em Configurações.
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS imagem_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos', 'produtos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "produtos_bucket_insert_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "produtos_bucket_update_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "produtos_bucket_delete_mesma_empresa" ON storage.objects;

CREATE POLICY "produtos_bucket_insert_mesma_empresa"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'produtos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "produtos_bucket_update_mesma_empresa"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'produtos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'produtos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "produtos_bucket_delete_mesma_empresa"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'produtos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);
