-- Bucket "visitas" e publico (leitura via URL publica nao passa por RLS), mas o upload
-- (INSERT) nunca teve nenhuma policy no storage.objects, entao toda tentativa de anexar
-- foto numa visita falhava silenciosamente (o codigo engolia o erro). Confirmado: 0 das
-- 40 visitas registradas tem foto_url preenchido e o bucket esta vazio.
DROP POLICY IF EXISTS "visitas_bucket_insert_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "visitas_bucket_update_mesma_empresa" ON storage.objects;

CREATE POLICY "visitas_bucket_insert_mesma_empresa"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'visitas'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "visitas_bucket_update_mesma_empresa"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'visitas'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'visitas'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);
