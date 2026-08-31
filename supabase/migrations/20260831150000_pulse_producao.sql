-- Consumo de matéria-prima por produção — hoje o Pulse só modela revenda (você tem X
-- unidades de um item e vende esse mesmo item). Fábrica (ex: carroceria) precisa de
-- "usei 3 chapas de aço + 2L de tinta pra fabricar 1 carroceria": baixa várias
-- matérias-primas de uma vez e calcula o custo do produto final somando elas —
-- ficha técnica simples, não um MRP completo.

CREATE TABLE IF NOT EXISTS public.pulse_producoes (
  id                    bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id            uuid        NOT NULL,
  produto_final_id      bigint      REFERENCES public.servicos(id) ON DELETE SET NULL,
  produto_final_nome    text        NOT NULL,
  quantidade_produzida  numeric     NOT NULL,
  custo_total           numeric     NOT NULL DEFAULT 0,
  observacao            text,
  user_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pulse_producao_itens (
  id                  bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  producao_id         bigint      NOT NULL REFERENCES public.pulse_producoes(id) ON DELETE CASCADE,
  servico_id          bigint      NOT NULL REFERENCES public.servicos(id) ON DELETE RESTRICT,
  materia_prima_nome  text        NOT NULL,
  quantidade          numeric     NOT NULL,
  custo_unitario      numeric     NOT NULL DEFAULT 0,
  subtotal            numeric     NOT NULL DEFAULT 0
);

-- Rastreabilidade: liga o lançamento no kardex (estoque_movimentacoes) à produção que
-- causou ele, tanto pra saída de matéria-prima quanto pra entrada do produto final.
ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS producao_id bigint REFERENCES public.pulse_producoes(id) ON DELETE SET NULL;

ALTER TABLE public.pulse_producoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_producao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulse_producoes_select_empresa" ON public.pulse_producoes;
DROP POLICY IF EXISTS "pulse_producoes_insert_empresa" ON public.pulse_producoes;
CREATE POLICY "pulse_producoes_select_empresa" ON public.pulse_producoes
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_producoes_insert_empresa" ON public.pulse_producoes
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

DROP POLICY IF EXISTS "pulse_producao_itens_select_empresa" ON public.pulse_producao_itens;
DROP POLICY IF EXISTS "pulse_producao_itens_insert_empresa" ON public.pulse_producao_itens;
CREATE POLICY "pulse_producao_itens_select_empresa" ON public.pulse_producao_itens
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.pulse_producoes p WHERE p.id = producao_id AND p.empresa_id = public.meu_empresa_id()));
CREATE POLICY "pulse_producao_itens_insert_empresa" ON public.pulse_producao_itens
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.pulse_producoes p WHERE p.id = producao_id AND p.empresa_id = public.meu_empresa_id()));

CREATE INDEX IF NOT EXISTS pulse_producoes_empresa_id_idx ON public.pulse_producoes(empresa_id);
CREATE INDEX IF NOT EXISTS pulse_producao_itens_producao_id_idx ON public.pulse_producao_itens(producao_id);

GRANT SELECT, INSERT ON public.pulse_producoes TO authenticated, service_role;
GRANT SELECT, INSERT ON public.pulse_producao_itens TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
