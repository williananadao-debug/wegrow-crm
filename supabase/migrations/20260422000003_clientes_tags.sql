ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
