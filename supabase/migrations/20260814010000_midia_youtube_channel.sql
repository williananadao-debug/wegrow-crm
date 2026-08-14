-- Canal do YouTube pra puxar estatísticas ao vivo (visualizações totais, inscritos).
-- Reaproveita midia_meta_config (já guarda credenciais externas do módulo Mídia) em vez
-- de criar tabela nova só pra um campo — mesma RLS restrita a diretor que já existe ali.
ALTER TABLE public.midia_meta_config ADD COLUMN IF NOT EXISTS youtube_channel_id text;
