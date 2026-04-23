-- Configura empresa CDL de Taio como plataforma de associação
-- empresa_id: 388620c8-4263-4d1a-bf96-ca69a12f621f

INSERT INTO empresas (id, nome, cnpj, plano, status, modulos)
VALUES (
  '388620c8-4263-4d1a-bf96-ca69a12f621f',
  'CDL de Taio',
  NULL,
  'enterprise',
  'ativa',
  '{"cdl": true, "financeiro": true, "ia": false, "opec": false}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  nome    = EXCLUDED.nome,
  plano   = EXCLUDED.plano,
  status  = EXCLUDED.status,
  modulos = empresas.modulos || '{"cdl": true, "financeiro": true}'::jsonb;
