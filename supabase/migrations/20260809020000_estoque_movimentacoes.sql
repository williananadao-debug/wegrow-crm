-- Historico de entradas de estoque por nota fiscal — kardex simples. Hoje o
-- estoque so guarda o numero final (servicos.estoque); essa tabela registra
-- cada entrada individual (produto, quantidade, fornecedor, dados da NF) pra
-- dar rastreabilidade na tela /pulse/estoque. So entradas via leitura de nota
-- fiscal gravam aqui por enquanto — ajuste manual (+/-) e venda continuam sem
-- log, escopo deliberadamente menor.
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id              bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id      uuid        NOT NULL,
  servico_id      bigint      NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  quantidade      numeric     NOT NULL,
  valor_unitario  numeric,
  fornecedor      text,
  nf_numero       text,
  nf_serie        text,
  nf_chave_acesso text,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estoque_movimentacoes_select_empresa" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS "estoque_movimentacoes_insert_empresa" ON public.estoque_movimentacoes;

CREATE POLICY "estoque_movimentacoes_select_empresa" ON public.estoque_movimentacoes
  FOR SELECT USING (empresa_id = public.meu_empresa_id());

CREATE POLICY "estoque_movimentacoes_insert_empresa" ON public.estoque_movimentacoes
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS estoque_movimentacoes_servico_id_idx ON public.estoque_movimentacoes(servico_id);
CREATE INDEX IF NOT EXISTS estoque_movimentacoes_empresa_id_idx ON public.estoque_movimentacoes(empresa_id);

-- Tabela criada via SQL Editor nao herda os GRANTs padrao do dashboard do Supabase
-- (mesmo bug ja visto em metas e nexus_arquivos) -- aplica de uma vez pra nao repetir.
GRANT SELECT, INSERT ON public.estoque_movimentacoes TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
