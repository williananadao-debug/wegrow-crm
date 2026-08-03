-- Upload do contrato assinado manualmente aceita mais de um arquivo (ex: fotos de cada
-- pagina do contrato impresso). contrato_manual_url continua guardando o primeiro arquivo
-- (usado pra liberar producao); contrato_manual_arquivos guarda a lista completa.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contrato_manual_arquivos JSONB DEFAULT NULL;

-- Bucket "contratos-assinados" e privado e so tinha policy de leitura (SELECT). O upload
-- (INSERT) e o upsert:true (UPDATE) do storage.objects estavam sem nenhuma policy, entao
-- todo upload caia em "new row violates row-level security policy".
DROP POLICY IF EXISTS "contratos_assinados_insert_mesma_empresa" ON storage.objects;
DROP POLICY IF EXISTS "contratos_assinados_update_mesma_empresa" ON storage.objects;

CREATE POLICY "contratos_assinados_insert_mesma_empresa"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contratos-assinados'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.empresa_id = l.empresa_id
    WHERE p.id = auth.uid()
      AND (storage.foldername(name))[1] = l.id::text
  )
);

CREATE POLICY "contratos_assinados_update_mesma_empresa"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contratos-assinados'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.empresa_id = l.empresa_id
    WHERE p.id = auth.uid()
      AND (storage.foldername(name))[1] = l.id::text
  )
)
WITH CHECK (
  bucket_id = 'contratos-assinados'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.empresa_id = l.empresa_id
    WHERE p.id = auth.uid()
      AND (storage.foldername(name))[1] = l.id::text
  )
);
