-- NF da WeGrow por emissora: clientes como a Demais FM (3 emissoras, cada uma com CNPJ próprio)
-- recebem uma NFS-e por emissora, no nome e CNPJ cadastrados em Unidades, com o valor mensal
-- dividido entre elas.
ALTER TABLE clientes_wegrow ADD COLUMN IF NOT EXISTS nf_por_emissora boolean NOT NULL DEFAULT false;

ALTER TABLE wegrow_notas_fiscais ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id) ON DELETE SET NULL;
ALTER TABLE wegrow_notas_fiscais ADD COLUMN IF NOT EXISTS tomador text;
CREATE INDEX IF NOT EXISTS wegrow_notas_fiscais_unidade_idx ON wegrow_notas_fiscais (unidade_id) WHERE unidade_id IS NOT NULL;

-- Demais FM: uma nota para cada emissora
UPDATE clientes_wegrow SET nf_por_emissora = true
 WHERE empresa_id IN (SELECT id FROM empresas WHERE nome = 'Demais FM');

NOTIFY pgrst, 'reload schema';
