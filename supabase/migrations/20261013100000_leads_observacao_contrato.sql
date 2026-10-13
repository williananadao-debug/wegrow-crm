-- Observação que sai no contrato/proposta. Antes o contrato usava a nota mais recente do lead,
-- mas as notas são a conversa interna da equipe (e recebem notas automáticas: motivo de perda,
-- registro de WhatsApp/e-mail).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS observacao_contrato text;
