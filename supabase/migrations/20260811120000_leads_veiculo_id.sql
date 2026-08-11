-- Vincula um lead a um veículo específico (loja de carros) — é o elo que falta
-- pra fechar um lead como "Ganho" no Kanban disparar a baixa do veículo, já
-- que hoje só a venda feita direto no checkout do Pulse baixa estoque.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_id bigint REFERENCES public.veiculos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_veiculo_id_idx ON public.leads(veiculo_id);
