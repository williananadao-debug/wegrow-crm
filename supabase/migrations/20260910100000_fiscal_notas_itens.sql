-- Itens de cada nota fiscal (produto, quantidade, valor) — fiscal_notas guardava só o
-- cabeçalho até aqui. Sem os itens não dá pra dar entrada automática no estoque por
-- produto quando o Focus NFe captura uma compra sozinho (webhook só manda o XML da nota
-- inteira, não item por item pronto pra usar).
--
-- Todo item nasce 'pendente' — nunca mexe em estoque_movimentacoes/servicos.estoque
-- sozinho. O casamento por nome (fornecedor chama "Chapa Aço 2mm", nosso catálogo chama
-- "Chapa de Aço 2mm") é só sugestão; confirmação fica com quem usa o Pulse, mesmo
-- cuidado que já existe na leitura de nota por foto — errar aqui é estoque errado com
-- dinheiro de verdade por trás.

CREATE TABLE IF NOT EXISTS public.fiscal_notas_itens (
  id                       bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nota_id                  bigint      NOT NULL REFERENCES public.fiscal_notas(id) ON DELETE CASCADE,
  descricao                text        NOT NULL,
  ncm                      text,
  quantidade               numeric     NOT NULL,
  valor_unitario           numeric     NOT NULL DEFAULT 0,
  servico_id               bigint      REFERENCES public.servicos(id) ON DELETE SET NULL,
  status                   text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'ignorado')),
  estoque_movimentacao_id  bigint      REFERENCES public.estoque_movimentacoes(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Resumo rápido pro filtro na tela de Notas Fiscais, sem precisar agregar
-- fiscal_notas_itens toda hora: 'sem_itens' (XML não tinha item ou nota é manual sem
-- foto), 'pendente_revisao' (tem item esperando confirmação), 'processado' (tudo
-- confirmado ou ignorado).
ALTER TABLE public.fiscal_notas
  ADD COLUMN IF NOT EXISTS itens_status text NOT NULL DEFAULT 'sem_itens'
    CHECK (itens_status IN ('sem_itens', 'pendente_revisao', 'processado'));

ALTER TABLE public.fiscal_notas_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_notas_itens_select_empresa" ON public.fiscal_notas_itens;
DROP POLICY IF EXISTS "fiscal_notas_itens_insert_empresa" ON public.fiscal_notas_itens;
DROP POLICY IF EXISTS "fiscal_notas_itens_update_empresa" ON public.fiscal_notas_itens;

CREATE POLICY "fiscal_notas_itens_select_empresa" ON public.fiscal_notas_itens
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.fiscal_notas n WHERE n.id = nota_id AND n.empresa_id = public.meu_empresa_id()));
CREATE POLICY "fiscal_notas_itens_insert_empresa" ON public.fiscal_notas_itens
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.fiscal_notas n WHERE n.id = nota_id AND n.empresa_id = public.meu_empresa_id()));
CREATE POLICY "fiscal_notas_itens_update_empresa" ON public.fiscal_notas_itens
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.fiscal_notas n WHERE n.id = nota_id AND n.empresa_id = public.meu_empresa_id()));

CREATE INDEX IF NOT EXISTS fiscal_notas_itens_nota_id_idx ON public.fiscal_notas_itens(nota_id);
CREATE INDEX IF NOT EXISTS fiscal_notas_itens_status_idx ON public.fiscal_notas_itens(status);
CREATE INDEX IF NOT EXISTS fiscal_notas_itens_status_idx2 ON public.fiscal_notas(itens_status);

GRANT SELECT, INSERT, UPDATE ON public.fiscal_notas_itens TO authenticated, service_role;
