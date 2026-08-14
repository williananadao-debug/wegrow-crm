-- Guarda o refresh token OAuth do Google (autorizado pelo dono do canal) pra buscar
-- visualizações mensais reais via YouTube Analytics API. Mesma coluna/tabela restrita
-- a diretor que já guarda o token do Instagram.
ALTER TABLE public.midia_meta_config ADD COLUMN IF NOT EXISTS youtube_oauth_refresh_token text;
ALTER TABLE public.midia_meta_config ADD COLUMN IF NOT EXISTS youtube_oauth_conectado_em timestamptz;
