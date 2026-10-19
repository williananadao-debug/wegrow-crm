-- Documentos e arquivos no cadastro do cliente, pra TODAS as empresas (antes só existia pelo
-- módulo Nexus, opcional, e num bucket público). Privado: entra RG/CPF, comprovante de
-- endereço, contrato, projeto do trailer — visualização por signed URL na hora do clique.
-- Mesmo padrão de advocacia_documentos (20260820100000), que já roda em produção.

CREATE TABLE IF NOT EXISTS public.clientes_documentos (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL,
  client_id         bigint      NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  categoria         text        NOT NULL DEFAULT 'outro'
                      CHECK (categoria IN ('documento_pessoal','comprovante','contrato','projeto','foto','outro')),
  titulo            text        NOT NULL,
  arquivo_path      text        NOT NULL,
  tamanho_bytes     bigint,
  tipo_mime         text,
  responsavel_nome  text,
  user_id           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_documentos_select_empresa" ON public.clientes_documentos;
DROP POLICY IF EXISTS "clientes_documentos_insert_empresa" ON public.clientes_documentos;
DROP POLICY IF EXISTS "clientes_documentos_update_empresa" ON public.clientes_documentos;
DROP POLICY IF EXISTS "clientes_documentos_delete_empresa" ON public.clientes_documentos;

CREATE POLICY "clientes_documentos_select_empresa" ON public.clientes_documentos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "clientes_documentos_insert_empresa" ON public.clientes_documentos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "clientes_documentos_update_empresa" ON public.clientes_documentos
  FOR UPDATE USING (empresa_id = public.meu_empresa_id()) WITH CHECK (empresa_id = public.meu_empresa_id());
-- Apagar: diretoria/gerência, ou quem enviou o arquivo.
CREATE POLICY "clientes_documentos_delete_empresa" ON public.clientes_documentos
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS clientes_documentos_client_id_idx ON public.clientes_documentos(client_id);
CREATE INDEX IF NOT EXISTS clientes_documentos_empresa_id_idx ON public.clientes_documentos(empresa_id);

-- ── Bucket privado (caminho: empresa_id/client_id/timestamp-nome.ext) ────────
-- 25 MB por arquivo. As 4 policies explícitas (o "contratos-assinados" já quebrou por faltar
-- INSERT/UPDATE na primeira versão).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('clientes-documentos', 'clientes-documentos', false, 26214400)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "clientes_documentos_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "clientes_documentos_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "clientes_documentos_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "clientes_documentos_bucket_delete" ON storage.objects;

CREATE POLICY "clientes_documentos_bucket_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'clientes-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "clientes_documentos_bucket_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'clientes-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "clientes_documentos_bucket_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'clientes-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'clientes-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "clientes_documentos_bucket_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'clientes-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

-- Tabela criada fora do dashboard não herda os grants padrão (mesmo bug de eleicao_cache).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes_documentos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
