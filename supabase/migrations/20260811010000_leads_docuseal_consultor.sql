-- Link e status da assinatura do consultor (1a etapa do fluxo Docuseal, antes de liberar
-- o link pro cliente) nunca eram salvos no lead -- so existiam em estado local do React.
-- Fechar o modal antes de mandar o link pro cliente perdia esse progresso, fazendo a tela
-- voltar pro formulario inicial como se nada tivesse sido assinado ainda.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS docuseal_consultor_sign_url text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS docuseal_consultor_assinado boolean NOT NULL DEFAULT false;
