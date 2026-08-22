-- Gestão financeira por veículo (Argus, vertical Veículos) — DRE simples por carro:
-- FIPE na compra, valor pago, custos de preparação item a item e lucro líquido na venda.
-- Não é estoque/vitrine (decisão já tomada em 20260811130000_leads_veiculo_referencia.sql)
-- — é só a camada financeira que faltava, igual todo outro módulo (Advocacia, Obras) já tem.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_placa text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_fipe_valor numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_valor_compra numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_data_compra date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_data_venda date;

CREATE TABLE IF NOT EXISTS public.leads_veiculo_custos (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lead_id     bigint      NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  empresa_id  uuid        NOT NULL,
  descricao   text        NOT NULL,
  valor       numeric     NOT NULL,
  data        date        NOT NULL DEFAULT current_date,
  criado_por  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_veiculo_custos_lead_id_idx ON public.leads_veiculo_custos(lead_id);
CREATE INDEX IF NOT EXISTS leads_veiculo_placa_idx ON public.leads(veiculo_placa);

ALTER TABLE public.leads_veiculo_custos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_veiculo_custos_select_empresa" ON public.leads_veiculo_custos;
DROP POLICY IF EXISTS "leads_veiculo_custos_write_empresa" ON public.leads_veiculo_custos;

-- Sem checar cargo (diferente de argus_comissao_config) — consistente com a própria RLS de
-- leads, onde qualquer usuário autenticado da empresa já pode editar (leads_update_empresa).
CREATE POLICY "leads_veiculo_custos_select_empresa" ON public.leads_veiculo_custos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "leads_veiculo_custos_write_empresa" ON public.leads_veiculo_custos
  FOR ALL USING (empresa_id = public.meu_empresa_id()) WITH CHECK (empresa_id = public.meu_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads_veiculo_custos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
