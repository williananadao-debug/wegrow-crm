-- Bucket pra guardar o arquivo original da nota fiscal (foto, PDF ou XML) lançada
-- manualmente/por leitura de IA em NotaFiscalModal e LancarNotaFiscalModal. Sem isso o
-- botão "Abrir NF" no Kardex do Estoque não tinha nada de verdade pra abrir — só notas
-- capturadas via Focus NFe (API oficial) tinham xml_url/danfe_url preenchidos.
-- Mesmo padrão do bucket "produtos" (20260808020000_servicos_imagem_url.sql): público,
-- upload restrito a quem é da mesma empresa (pasta = empresa_id).

INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-fiscais', 'notas-fiscais', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "notas_fiscais_bucket_insert_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "notas_fiscais_bucket_update_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "notas_fiscais_bucket_delete_mesma_empresa" ON storage.objects;

CREATE POLICY "notas_fiscais_bucket_insert_mesma_empresa"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "notas_fiscais_bucket_update_mesma_empresa"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "notas_fiscais_bucket_delete_mesma_empresa"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.empresa_id::text = (storage.foldername(name))[1]
  )
);
