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
  -- Conta de demonstração (antiga RBN, renomeada para ONDA DEMO / emissora Onda 98.1 em 03/11/2026)
  v_emp := '80fc2113-3112-4471-87c0-08770dd2ccb1';
  SELECT count(*) INTO v_count FROM empresas WHERE id = v_emp;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Conta de demonstração não encontrada.'; END IF;

  -- Visitas demo (20261029130000) = as ligadas aos anunciantes demo; antes dos clientes (FK vira NULL).
  DELETE FROM visitas WHERE empresa_id = v_emp AND cliente_id IN (SELECT id FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED');
  -- Tarefas demo (20261029140000) = as que citam um anunciante demo no título.
  DELETE FROM tarefas t WHERE t.empresa_id = v_emp AND EXISTS (
    SELECT 1 FROM clientes c WHERE c.empresa_id = v_emp AND c.observacao_risco = 'DEMO-SEED' AND t.titulo LIKE '%' || c.nome_empresa || '%');
  DELETE FROM jobs WHERE empresa_id = v_emp AND briefing LIKE '%DEMO-SEED%';
  DELETE FROM lancamentos WHERE empresa_id = v_emp AND nf_numero = 'DEMO';
  -- Vendas demo: o complemento 20261103120000 troca a origem 'demo_seed' por origens realistas,
  -- então também pega as vendas ligadas a anunciantes demo.
  DELETE FROM leads WHERE empresa_id = v_emp AND (origem = 'demo_seed' OR client_id IN (SELECT id FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED'));
  -- Audiência demo (complemento 20261103120000); as faixas saem junto (cascade)
  IF to_regclass('public.audiencia_pesquisas') IS NOT NULL THEN
    DELETE FROM audiencia_pesquisas WHERE empresa_id = v_emp AND observacao = 'DEMO-SEED';
  END IF;
  DELETE FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED';
  DELETE FROM servicos WHERE empresa_id = v_emp AND descricao LIKE 'DEMO-SEED%';
  -- DELETE FROM metas WHERE empresa_id = v_emp AND ano = 2026 AND tipo = 'faturamento' AND user_id IS NULL;
END $limpa$;
