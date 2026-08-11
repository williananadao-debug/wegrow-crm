-- Devolução/estorno de venda (Pulse) — registra quando e por que uma venda ganha foi
-- estornada, sem apagar o lead nem o histórico. status vira 'perdido' de propósito: isso
-- já exclui a venda de faturamento/ranking/conversão em todo o resto do sistema sem
-- precisar mexer em nenhuma query existente (todas já filtram por status = 'ganho').
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estornado_em timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estornado_motivo text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estornado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;
