-- Add OPEC integration config to unidades
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS config_opec JSONB DEFAULT NULL;

COMMENT ON COLUMN unidades.config_opec IS 'OPEC integration config: { mercado_id, mercado_codigo, mercado_descricao, mercado_cnpj }';
