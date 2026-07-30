-- Corrige "permission denied for table visitas" (grants ausentes/revogados)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.visitas TO anon, authenticated, service_role;

-- Cidade da visita (pra exibir no card do painel de Visitas)
ALTER TABLE public.visitas ADD COLUMN IF NOT EXISTS cidade TEXT DEFAULT NULL;
