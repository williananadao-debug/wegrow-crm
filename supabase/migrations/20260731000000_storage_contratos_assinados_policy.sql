-- Bucket "contratos-assinados" é privado; sem policy nenhum usuário autenticado
-- conseguia ler os arquivos (createSignedUrl falhava). Libera leitura só pra quem
-- pertence à mesma empresa do lead dono do contrato (primeiro segmento do path = lead.id).
DROP POLICY IF EXISTS "contratos_assinados_select_mesma_empresa" ON storage.objects;

CREATE POLICY "contratos_assinados_select_mesma_empresa"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contratos-assinados'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.empresa_id = l.empresa_id
    WHERE p.id = auth.uid()
      AND (storage.foldername(name))[1] = l.id::text
  )
);
