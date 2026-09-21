-- Gestão de estoque completa (Pulse): fornecedores, pedido de compra, parâmetros de reposição
-- por item (máximo, prazo, localização, fornecedor padrão), custo médio e requisição de saída.

-- ============ Fornecedores ============
CREATE TABLE IF NOT EXISTS public.pulse_fornecedores (
  id                 bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id         uuid        NOT NULL,
  nome               text        NOT NULL,
  cnpj               text,
  contato            text,
  telefone           text,
  email              text,
  prazo_entrega_dias integer,
  observacao         text,
  ativo              boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Quem vende cada item, com o código dele (cProd da nota) e o último preço pago
CREATE TABLE IF NOT EXISTS public.pulse_fornecedor_itens (
  id                 bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id         uuid        NOT NULL,
  fornecedor_id      bigint      NOT NULL REFERENCES public.pulse_fornecedores(id) ON DELETE CASCADE,
  servico_id         bigint      NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  codigo_fornecedor  text,
  ultimo_preco       numeric,
  ultima_compra      date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fornecedor_id, servico_id)
);

-- ============ Parâmetros de reposição por item ============
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS estoque_maximo numeric;
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS prazo_reposicao_dias integer;   -- prazo de COMPRA (não confundir com prazo_fabricacao_dias)
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS localizacao text;               -- galpão / prateleira
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS fornecedor_padrao_id bigint REFERENCES public.pulse_fornecedores(id) ON DELETE SET NULL;

-- ============ Pedido de compra ============
CREATE TABLE IF NOT EXISTS public.pulse_pedidos_compra (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL,
  fornecedor_id     bigint      REFERENCES public.pulse_fornecedores(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'parcial', 'recebido', 'cancelado')),
  previsao_entrega  date,
  observacao        text,
  criado_por        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pulse_pedidos_compra_itens (
  id                   bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  pedido_id            bigint      NOT NULL REFERENCES public.pulse_pedidos_compra(id) ON DELETE CASCADE,
  servico_id           bigint      NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  quantidade           numeric     NOT NULL CHECK (quantidade > 0),
  quantidade_recebida  numeric     NOT NULL DEFAULT 0,
  valor_unitario       numeric     NOT NULL DEFAULT 0
);

-- ============ Requisição de saída (agrupa várias saídas + destino) ============
ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS requisicao_id uuid;
ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS destino text;      -- produção / cliente / obra / setor
CREATE INDEX IF NOT EXISTS estoque_movimentacoes_requisicao_idx ON public.estoque_movimentacoes(requisicao_id) WHERE requisicao_id IS NOT NULL;

-- ============ RLS (mesmo padrão: tudo da própria empresa) ============
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pulse_fornecedores', 'pulse_fornecedor_itens', 'pulse_pedidos_compra'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_all_empresa" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_all_empresa" ON public.%I FOR ALL USING (empresa_id = public.meu_empresa_id()) WITH CHECK (empresa_id = public.meu_empresa_id())', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(empresa_id)', t || '_empresa_idx', t);
  END LOOP;
END $rls$;

ALTER TABLE public.pulse_pedidos_compra_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pulse_pedidos_compra_itens_all_empresa" ON public.pulse_pedidos_compra_itens;
CREATE POLICY "pulse_pedidos_compra_itens_all_empresa" ON public.pulse_pedidos_compra_itens FOR ALL
  USING (EXISTS (SELECT 1 FROM public.pulse_pedidos_compra p WHERE p.id = pedido_id AND p.empresa_id = public.meu_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pulse_pedidos_compra p WHERE p.id = pedido_id AND p.empresa_id = public.meu_empresa_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_pedidos_compra_itens TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS pulse_pedidos_compra_itens_pedido_idx ON public.pulse_pedidos_compra_itens(pedido_id);
CREATE INDEX IF NOT EXISTS pulse_fornecedor_itens_servico_idx ON public.pulse_fornecedor_itens(servico_id);
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ============ Custo médio ponderado / último custo por item ============
-- Calculado do histórico de ENTRADAS com valor (notas, compras): Σ(qtd × valor) ÷ Σ(qtd).
-- View (não coluna) pra não depender de cada tela que dá entrada lembrar de atualizar.
-- security_invoker: respeita o RLS de quem consulta (view comum ignoraria).
CREATE OR REPLACE VIEW public.pulse_estoque_custos WITH (security_invoker = true) AS
SELECT
  m.servico_id,
  m.empresa_id,
  CASE WHEN SUM(m.quantidade) > 0 THEN ROUND(SUM(m.quantidade * m.valor_unitario) / SUM(m.quantidade), 4) END AS custo_medio,
  (ARRAY_AGG(m.valor_unitario ORDER BY m.created_at DESC))[1]  AS ultimo_custo,
  MAX(m.created_at)                                            AS ultima_entrada,
  COUNT(*)                                                     AS entradas
FROM public.estoque_movimentacoes m
WHERE m.quantidade > 0 AND m.valor_unitario IS NOT NULL AND m.valor_unitario > 0
  AND COALESCE(m.tipo, '') NOT IN ('estorno')
GROUP BY m.servico_id, m.empresa_id;
GRANT SELECT ON public.pulse_estoque_custos TO authenticated, service_role;
