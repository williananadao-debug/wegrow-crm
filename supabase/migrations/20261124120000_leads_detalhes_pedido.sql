-- Detalhes do pedido na venda (24/11/2026, inspirado na compra de mídia do beComm usado pela
-- Sintonia): autorização, peça, produto, campanha, formato, tipo do contrato, governamental e
-- contrato auditado num jsonb só, e os arquivos anexados ao pedido (bucket contratos-assinados,
-- caminho <lead>/pedido/...). O PI continua em leads.num_pi.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pedido_detalhes jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pedido_arquivos jsonb;
NOTIFY pgrst, 'reload schema';
