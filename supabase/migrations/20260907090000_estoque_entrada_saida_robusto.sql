-- Modelo mais robusto de entrada/saída de estoque — pedido depois que a Trailer Travel
-- pediu integração de NF-e completa. Emissão real fica pra quando houver certificado
-- digital A1 + provedor (Focus NFe) contratados; isso aqui é o que dá pra fazer agora:
-- motivo categorizado nos dois sentidos, CNPJ do participante rastreado, e a nota
-- referenciada (fiscal_notas) de fato ligada ao movimento que a originou.

ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS cnpj_participante text;

COMMENT ON COLUMN public.estoque_movimentacoes.motivo IS
  'entrada: compra | devolucao_cliente | transferencia | contagem | outros — saida: venda | perda | devolucao_fornecedor | transferencia | uso_interno | contagem';

ALTER TABLE public.fiscal_notas
  ADD COLUMN IF NOT EXISTS estoque_movimentacao_id bigint REFERENCES public.estoque_movimentacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS estoque_movimentacoes_motivo_idx ON public.estoque_movimentacoes(motivo);
CREATE INDEX IF NOT EXISTS fiscal_notas_estoque_movimentacao_id_idx ON public.fiscal_notas(estoque_movimentacao_id);
