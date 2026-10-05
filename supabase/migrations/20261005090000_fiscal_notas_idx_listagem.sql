-- Índice da listagem de /pulse/fiscal: filtra por empresa e ordena por data_emissao/created_at.
-- Sem ele o Postgres ordenava todas as notas da empresa a cada abertura da tela.
CREATE INDEX IF NOT EXISTS fiscal_notas_empresa_emissao_idx
  ON public.fiscal_notas (empresa_id, data_emissao DESC NULLS LAST, created_at DESC);
