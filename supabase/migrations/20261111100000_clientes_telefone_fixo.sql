-- Telefone fixo no cadastro do cliente (11/11/2026). O campo "telefone" continua sendo o
-- celular/WhatsApp (é o que a API do OPEC envia como telefone_whatsapp).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telefone_fixo text;
NOTIFY pgrst, 'reload schema';
