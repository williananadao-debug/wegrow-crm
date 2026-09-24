-- Mesmo backfill do commit 85ec356, mas retroativo — pra NFs emitidas pelo fluxo automático
-- do Pulse (emitir-nf1/nf2 + webhook focus-nfe/emitida) ANTES desse fix existir. A
-- movimentação de baixa de estoque (tipo 'venda') nasceu no fechamento da venda sem nenhuma
-- NF vinculada, e o webhook nunca voltava pra completar isso — por isso a coluna de NF na
-- tela de Estoque ficava em branco mesmo com a nota autorizada e visível em /pulse/fiscal.
-- Só toca movimentação que ainda não tem nf_numero (não sobrescreve nada já preenchido pela
-- via manual/backfill anterior).
UPDATE public.estoque_movimentacoes em
SET
  nf_numero = fn.numero,
  nf_serie = fn.serie,
  nf_chave_acesso = fn.chave_acesso
FROM public.fiscal_notas fn
WHERE em.lead_id = fn.lead_id
  AND em.tipo = 'venda'
  AND em.nf_numero IS NULL
  AND fn.lead_id IS NOT NULL
  AND fn.status = 'autorizada'
  AND fn.numero IS NOT NULL;
