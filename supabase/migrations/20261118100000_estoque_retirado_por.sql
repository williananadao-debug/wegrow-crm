-- Saída de estoque não guardava QUEM levou o item, só quem registrou (user_id = almoxarife).
-- O almoxarifado escrevia o nome no Destino ou na Observação e depois não achava
-- ("o Fabrício pegou a parafusadeira segunda, perdeu, e eu não lembro o dia").
-- Coluna estruturada pra filtrar e agrupar por pessoa no Kardex. Texto livre de propósito:
-- quem retira normalmente é funcionário de chão de fábrica, sem login no sistema.
ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS retirado_por text;

CREATE INDEX IF NOT EXISTS estoque_movimentacoes_retirado_por_idx
  ON public.estoque_movimentacoes (empresa_id, lower(retirado_por))
  WHERE retirado_por IS NOT NULL;
