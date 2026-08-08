-- Controle de estoque por produto (opt-in): nulo = item não controlado (ex: serviços de
-- mídia/produção que não fazem sentido em "unidades disponíveis"). Usado pelo módulo
-- venda_rapida — desconta automaticamente ao fechar uma venda rápida.
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS estoque numeric;
