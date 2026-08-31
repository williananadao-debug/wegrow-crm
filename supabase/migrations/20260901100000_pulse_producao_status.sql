-- Acompanhamento de etapa por produção — hoje era uma transação instantânea (registra
-- e já baixa matéria-prima tudo de uma vez). Continua consumindo matéria-prima na
-- criação (já é o compromisso de que vai produzir), mas ganha status pra acompanhar o
-- andamento físico do trabalho até a entrega.
ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'em_producao'
  CHECK (status IN ('em_producao', 'concluida', 'entregue'));
