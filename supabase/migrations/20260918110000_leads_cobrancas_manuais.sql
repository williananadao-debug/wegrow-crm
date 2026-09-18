-- Cobrança manual (boleto/Pix gerado na hora, via botão "Gerar boleto ou Pix")
-- nunca ficava salva em lugar nenhum — sumia ao fechar o modal, sem jeito de
-- reabrir depois. Guarda como array jsonb no próprio lead, mesmo padrão já usado
-- em leads.cobrancas_recorrentes (cron mensal) — mas em coluna separada, porque o
-- cron confere "já cobrei esse mês?" pelo campo `mes` desse outro array, e cobrança
-- manual não tem mês de referência (não pode se misturar com aquela checagem).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cobrancas_manuais jsonb NOT NULL DEFAULT '[]';
