-- Logo por empresa (tenant) — mostrado no menu lateral no lugar do quadrado com a
-- inicial. Bucket público (leitura via URL direta), upload só pelo admin (service role
-- via /api/admin/empresas/logo, não passa por RLS de storage.objects).
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('empresa-logos', 'empresa-logos', true)
ON CONFLICT (id) DO NOTHING;
