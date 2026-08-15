-- Card "Redes sociais" da Visão Geral passa a ser preenchido manual (números que já
-- existem prontos no painel do Leo/IAlto) em vez de depender da integração Instagram
-- Graph API direta, que exigiria credencial própria por emissora — decisão do Willian
-- em 2026-08-15 pra não perseguir integração ao vivo agora.
ALTER TABLE public.midia_metricas_mensais ADD COLUMN IF NOT EXISTS redes_sociais_visualizacoes bigint;
ALTER TABLE public.midia_metricas_mensais ADD COLUMN IF NOT EXISTS redes_sociais_interacoes bigint;
ALTER TABLE public.midia_metricas_mensais ADD COLUMN IF NOT EXISTS redes_sociais_visitas_perfil bigint;
