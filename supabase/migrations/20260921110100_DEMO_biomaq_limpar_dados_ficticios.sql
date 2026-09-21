-- LIMPEZA dos dados fictícios da BIOMAQ (carga 20260921110000_DEMO_biomaq_dados_ficticios.sql).
-- Apaga SÓ o que foi marcado como demo — nada do que a Biomaq cadastrar de verdade:
--   leads.origem = 'demo_seed' · clientes.observacao_risco = 'DEMO-SEED'
--   servicos.descricao 'DEMO-SEED…' (matéria-prima) · lancamentos/estoque_movimentacoes.nf_numero = 'DEMO'
-- Rode no SQL Editor ANTES da Biomaq começar a operar de verdade. Não apaga o catálogo de
-- equipamentos nem a configuração de módulos (20260921100000_biomaq_config_empresa_catalogo.sql).

DO $limpa$
DECLARE
  v_emp uuid := 'dc3c3320-f652-4289-ae91-eab23ef956f2';
  n bigint;
BEGIN
  DELETE FROM visitas WHERE empresa_id = v_emp AND observacao LIKE 'DEMO-SEED%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'visitas: %', n;

  DELETE FROM estoque_movimentacoes WHERE empresa_id = v_emp AND nf_numero = 'DEMO';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'movimentações de estoque: %', n;

  -- eventos e itens da produção caem junto (ON DELETE CASCADE)
  DELETE FROM pulse_producoes WHERE empresa_id = v_emp
    AND lead_id IN (SELECT id FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'produções: %', n;

  DELETE FROM lancamentos WHERE empresa_id = v_emp AND nf_numero = 'DEMO';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'lançamentos: %', n;

  -- ficha técnica aponta pra matéria-prima com ON DELETE RESTRICT: sai antes dela
  DELETE FROM pulse_fichas_tecnicas WHERE empresa_id = v_emp
    AND servico_id IN (SELECT id FROM servicos WHERE empresa_id = v_emp AND descricao LIKE 'DEMO-SEED%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'fichas técnicas: %', n;

  DELETE FROM servicos WHERE empresa_id = v_emp AND descricao LIKE 'DEMO-SEED%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'itens de estoque: %', n;

  DELETE FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'leads: %', n;

  DELETE FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'clientes: %', n;
END $limpa$;
