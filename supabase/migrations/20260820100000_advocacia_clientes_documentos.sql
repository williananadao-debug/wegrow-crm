-- Advocacia ganha cadastro de cliente de verdade (liga processos à tabela `clientes` já
-- usada pelo resto do sistema, em vez de só um texto livre) e upload de documento — em
-- lead (intake) e em cliente. Documento não pode depender do módulo Nexus (que é opcional
-- e separado): tabela e bucket próprios, sempre disponíveis com modulos.advocacia=true.

-- ── Liga processo a um cliente real ──────────────────────────────────
ALTER TABLE public.advocacia_processos
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS advocacia_processos_client_id_idx ON public.advocacia_processos(client_id);

-- ── `advocacia_documentos` — linha por arquivo, mesmo formato de nexus_arquivos, mas
-- privado (documento jurídico é dado sensível) e pode nascer preso a um lead OU a um
-- cliente (ou os dois, depois que o lead vira cliente — ver garantirProcesso).
CREATE TABLE IF NOT EXISTS public.advocacia_documentos (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL,
  client_id         bigint      REFERENCES public.clientes(id) ON DELETE CASCADE,
  lead_id           bigint      REFERENCES public.leads(id) ON DELETE CASCADE,
  processo_id       bigint      REFERENCES public.advocacia_processos(id) ON DELETE SET NULL,
  categoria         text        NOT NULL DEFAULT 'outro'
                      CHECK (categoria IN ('procuracao','documento_pessoal','contrato','peticao','comprovante','outro')),
  titulo            text        NOT NULL,
  arquivo_url       text,
  arquivo_path      text        NOT NULL,
  tamanho_bytes     bigint,
  responsavel_nome  text,
  user_id           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advocacia_documentos_precisa_dono CHECK (client_id IS NOT NULL OR lead_id IS NOT NULL)
);

ALTER TABLE public.advocacia_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advocacia_documentos_select_empresa" ON public.advocacia_documentos;
DROP POLICY IF EXISTS "advocacia_documentos_insert_empresa" ON public.advocacia_documentos;
DROP POLICY IF EXISTS "advocacia_documentos_delete_empresa" ON public.advocacia_documentos;

CREATE POLICY "advocacia_documentos_select_empresa" ON public.advocacia_documentos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_documentos_insert_empresa" ON public.advocacia_documentos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_documentos_delete_empresa" ON public.advocacia_documentos
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND (public.meu_cargo() IN ('diretor','gerente') OR user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS advocacia_documentos_empresa_id_idx ON public.advocacia_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS advocacia_documentos_client_id_idx ON public.advocacia_documentos(client_id);
CREATE INDEX IF NOT EXISTS advocacia_documentos_lead_id_idx ON public.advocacia_documentos(lead_id);

-- ── Bucket privado + policies ─────────────────────────────────────────
-- Privado (diferente do bucket "nexus", que é público) porque aqui entra RG/CPF,
-- procuração, petição — dado sensível. Caminho de upload: empresa_id/lead_ou_client_id/
-- timestamp.ext (mesma convenção do bucket "nexus"), visualização via createSignedUrl.
-- As 4 policies (SELECT/INSERT/UPDATE/DELETE) explícitas de propósito — o bucket
-- "contratos-assinados" já quebrou por esquecer INSERT/UPDATE na primeira versão
-- (ver 20260803010000_contrato_manual_multi_e_policy.sql).
INSERT INTO storage.buckets (id, name, public)
VALUES ('advocacia-documentos', 'advocacia-documentos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "advocacia_documentos_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "advocacia_documentos_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "advocacia_documentos_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "advocacia_documentos_bucket_delete" ON storage.objects;

CREATE POLICY "advocacia_documentos_bucket_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'advocacia-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "advocacia_documentos_bucket_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'advocacia-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "advocacia_documentos_bucket_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'advocacia-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'advocacia-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "advocacia_documentos_bucket_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'advocacia-documentos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id::text = (storage.foldername(name))[1])
);

-- ── GRANTs explícitos ───────────────────────────────────────────────
-- Tabela criada fora do dashboard do Supabase não herda os grants padrão — mesmo bug já
-- visto em metas/nexus_arquivos/argus/advocacia_processos.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advocacia_documentos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
