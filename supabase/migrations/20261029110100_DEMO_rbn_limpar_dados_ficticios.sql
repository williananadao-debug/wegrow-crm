-- Remove os DADOS FICTÍCIOS de demonstração da RBN 94,3 (20261029110000_DEMO_rbn_dados_ficticios.sql).
-- Só apaga o que está marcado como demo — dados reais da RBN não são tocados:
--   leads.origem = 'demo_seed' · jobs.briefing com 'DEMO-SEED' · lancamentos.nf_numero = 'DEMO'
--   clientes.observacao_risco = 'DEMO-SEED' · servicos.descricao 'DEMO-SEED…'
-- As metas de faturamento 2026 criadas pela carga ficam (podem ter sido ajustadas na tela de Metas);
-- se quiser apagar também, descomente a linha no fim.

DO $limpa$
DECLARE
  v_emp uuid;
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM empresas WHERE nome ILIKE '%rbn%';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Esperava 1 empresa com "RBN" no nome, achou %. Ajuste o filtro.', v_count; END IF;
  SELECT id INTO v_emp FROM empresas WHERE nome ILIKE '%rbn%';

  DELETE FROM jobs WHERE empresa_id = v_emp AND briefing LIKE '%DEMO-SEED%';
  DELETE FROM lancamentos WHERE empresa_id = v_emp AND nf_numero = 'DEMO';
  DELETE FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed';
  DELETE FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED';
  DELETE FROM servicos WHERE empresa_id = v_emp AND descricao LIKE 'DEMO-SEED%';
  -- DELETE FROM metas WHERE empresa_id = v_emp AND ano = 2026 AND tipo = 'faturamento' AND user_id IS NULL;
END $limpa$;
