-- Checklist por etapa de fabricação. Os itens de cada etapa ficam na configuração da empresa
-- (empresas.modulos.pulse_etapas_fabricacao[].checklist); aqui fica o que já foi marcado em
-- cada produção: { "<nome da etapa>": { "<item>": { "por": "<user id>", "em": "<iso>" } } }.
-- A etapa só pode ser concluída com todos os itens marcados.
ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS checklist_feito jsonb NOT NULL DEFAULT '{}'::jsonb;
