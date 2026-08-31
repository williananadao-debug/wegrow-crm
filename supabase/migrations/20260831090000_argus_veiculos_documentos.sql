-- Gestão de arquivos por veículo no Argus Veículos — mesmo padrão de
-- advocacia_documentos (20260820100000_advocacia_clientes_documentos.sql): tabela +
-- bucket privado próprios, upload preso ao lead (o registro do veículo/venda),
-- visualização via signed URL. Categorias trocadas pra vocabulário de loja de veículo
-- (nota fiscal de compra/venda, CRLV, laudo cautelar) em vez de jurídico.

CREATE TABLE IF NOT EXISTS public.leads_veiculo_documentos (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL,
  lead_id           bigint      NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  categoria         text        NOT NULL DEFAULT 'outro'
                      CHECK (categoria IN ('nota_fiscal_compra','nota_fiscal_venda','crlv','laudo_cautelar','contrato','foto','outro')),
  titulo            text        NOT NULL,
  arquivo_path      text        NOT NULL,
  tamanho_bytes     bigint,
  responsavel_nome  text,
  user_id           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads_veiculo_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "veiculo_documentos_select_empresa" ON public.leads_veiculo_documentos;
DROP POLICY IF EXISTS "veiculo_documentos_insert_empresa" ON public.leads_veiculo_documentos;
DROP POLICY IF EXISTS "veiculo_documentos_delete_empresa" ON public.leads_veiculo_documentos;

CREATE POLICY "veiculo_documentos_select_empresa" ON public.leads_veiculo_documentos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "veiculo_documentos_insert_empresa" ON public.leads_veiculo_documentos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "veiculo_documentos_delete_empresa" ON public.leads_veiculo_documentos
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS leads_veiculo_documentos_empresa_id_idx ON public.leads_veiculo_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS leads_veiculo_documentos_lead_id_idx ON public.leads_veiculo_documentos(lead_id);

-- ── Bucket privado + policies (4 explícitas de propósito, ver histórico de bug em
-- "contratos-assinados" citado na migration de advocacia_documentos) ──────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('veiculos-documentos', 'veiculos-documentos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "veiculo_documentos_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "veiculo_documentos_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "veiculo_documentos_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "veiculo_documentos_bucket_delete" ON storage.objects;

CREATE POLICY "veiculo_documentos_bucket_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'veiculos-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "veiculo_documentos_bucket_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'veiculos-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "veiculo_documentos_bucket_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'veiculos-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'veiculos-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "veiculo_documentos_bucket_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'veiculos-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads_veiculo_documentos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
