-- Remove o movimento FICTÍCIO da SINTONIA (20261124130000). Os clientes reais não são tocados.
DO $limpa$
DECLARE v_emp uuid := '13f70c3e-54e6-4568-86ea-2141a17f7209'; M text := chr(8203);
BEGIN
  DELETE FROM visitas WHERE empresa_id = v_emp AND observacao LIKE '%' || M;
  DELETE FROM tarefas WHERE empresa_id = v_emp AND titulo LIKE '%' || M;
  DELETE FROM jobs WHERE empresa_id = v_emp AND briefing LIKE '%DEMO-SEED%';
  DELETE FROM lancamentos WHERE empresa_id = v_emp AND nf_numero = 'DEMO';
  DELETE FROM leads WHERE empresa_id = v_emp AND pedido_detalhes->>'demo' = 'true';
  DELETE FROM servicos WHERE empresa_id = v_emp AND descricao LIKE 'DEMO-SEED%';
  DELETE FROM metas WHERE empresa_id = v_emp AND ano = 2026 AND tipo = 'faturamento' AND user_id IS NULL;
END $limpa$;
