-- Add foto_url to visitas for photo check-in
ALTER TABLE public.visitas ADD COLUMN IF NOT EXISTS foto_url TEXT DEFAULT NULL;
