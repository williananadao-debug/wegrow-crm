-- Suporte a "quando um boleto/Pix (Asaas) é confirmado, marca a cobrança e o lançamento
-- financeiro correspondentes como pagos automaticamente" (webhook financeiro/webhook).
--
-- lead_id: link direto lançamento -> venda. Até agora o lançamento "VENDA RÁPIDA" criado em
-- finalizarVenda (Pulse) só tinha o ID da venda embutido como TEXTO livre dentro do título
-- ("... - OS: LD-1234"), sem coluna própria pra buscar — o webhook precisa achar o
-- lançamento certo pra marcar como pago, e ILIKE no título é frágil/lento sem essa coluna.
-- Fica NULL nos lançamentos antigos (não migra retroativamente; o webhook cai pro fallback
-- de ILIKE no título só pra esses casos).
--
-- asaas_payment_id: evita duplicar lançamento se a Asaas reenviar o mesmo webhook mais de
-- uma vez (acontece — é o comportamento documentado deles pra garantir entrega).
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS lead_id integer;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS asaas_payment_id text;
CREATE INDEX IF NOT EXISTS lancamentos_lead_id_idx ON public.lancamentos(lead_id) WHERE lead_id IS NOT NULL;
