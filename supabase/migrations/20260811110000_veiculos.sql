-- ============================================================
-- ESTOQUE DE VEÍCULOS (vertical automotivo do Pulse)
-- Cada carro continua sendo uma linha em servicos (reaproveita 100% do
-- checkout, decremento de estoque, estoque_movimentacoes e leitura de nota
-- fiscal do THOR) com tipo='veiculo' e estoque travado em 1 — vira 0 na
-- venda, que é a "baixa". Os campos automotivos ficam aqui, 1:1.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.veiculos (
  id              bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  servico_id      bigint      UNIQUE NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  empresa_id      uuid        NOT NULL,
  placa           text,
  chassi          text,
  renavam         text,
  marca           text,
  modelo          text,
  ano_fabricacao  int,
  ano_modelo      int,
  km              int,
  cor             text,
  combustivel     text,
  cambio          text,
  opcionais       text[],
  fotos           text[],
  status          text        NOT NULL DEFAULT 'disponivel', -- disponivel | reservado | vendido
  data_entrada    date        DEFAULT CURRENT_DATE,
  data_venda      date,
  venda_lead_id   bigint      REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "veiculos_select" ON public.veiculos;
DROP POLICY IF EXISTS "veiculos_insert" ON public.veiculos;
DROP POLICY IF EXISTS "veiculos_update" ON public.veiculos;
DROP POLICY IF EXISTS "veiculos_delete" ON public.veiculos;

CREATE POLICY "veiculos_select" ON public.veiculos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "veiculos_insert" ON public.veiculos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "veiculos_update" ON public.veiculos
  FOR UPDATE
  USING  (empresa_id = public.meu_empresa_id())
  WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE POLICY "veiculos_delete" ON public.veiculos
  FOR DELETE USING (
    empresa_id = public.meu_empresa_id()
    AND public.meu_cargo() IN ('diretor','gerente')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.veiculos TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS veiculos_empresa_status_idx ON public.veiculos(empresa_id, status);
CREATE INDEX IF NOT EXISTS veiculos_servico_idx ON public.veiculos(servico_id);
