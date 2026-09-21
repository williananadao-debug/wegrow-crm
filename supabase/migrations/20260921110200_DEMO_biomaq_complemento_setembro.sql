-- COMPLEMENTO dos dados fictícios da BIOMAQ: atividade no mês corrente (setembro/2026).
-- A carga principal (20260921110000_DEMO_...) tem vendas fechadas só de abril a agosto, então
-- Relatórios, Dashboard e Painel Pulse (que abrem no mês atual) apareciam zerados.
-- Aqui entram 2 vendas fechadas em setembro + 14 visitas. Rode DEPOIS da carga principal.
-- Tudo marcado como demo e removido por 20260921110100_DEMO_biomaq_limpar_dados_ficticios.sql.

DO $comp$
DECLARE
  v_emp uuid := 'dc3c3320-f652-4289-ae91-eab23ef956f2';
  v_users uuid[];
  v_u uuid;
  v_lead bigint;
  v_prod bigint;
  v_cli record;
  i int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed') THEN
    RAISE EXCEPTION 'Rode primeiro a carga principal (20260921110000_DEMO_biomaq_dados_ficticios.sql).';
  END IF;
  IF EXISTS (SELECT 1 FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed' AND descricao LIKE 'DEMO-L27 ·%') THEN
    RAISE EXCEPTION 'Complemento já carregado.';
  END IF;
  v_users := ARRAY(SELECT id FROM profiles WHERE empresa_id = v_emp ORDER BY (cargo = 'diretor') DESC, id);

  -- ---------- Venda 1: Cooperativa Grãos do Oeste — conversão, fechada em 04/09 ----------
  v_u := v_users[LEAST(2, array_length(v_users, 1))];
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, created_at)
  VALUES ('Cooperativa Grãos do Oeste', '(49) 3322-1212', '11.111.112/0001-12', 'Chapecó', 437000, 0,
    '[{"servico":"Sistema de Conversão — Grelha Móvel p/ Fornalha de Alvenaria","quantidade":1,"precoBase":410000,"precoUnitario":437000,"capacidade":"5.000.000 kcal/h","observacao":"Fornalha de alvenaria existente","configuracoes":[{"chave":"d0","descricao":"Automação com IHM (painel)","valor":27000}]}]'::jsonb,
    'ganho', 4, 'Direto', 'demo_seed', 'boleto', '7', 'DEMO-L27 · Cooperativa fechou a conversão após comparar com concorrente.',
    (SELECT id FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Cooperativa Grãos do Oeste' AND observacao_risco = 'DEMO-SEED' LIMIT 1),
    v_emp, v_u, v_u, v_u, 0, '2026-09-04 10:00:00-03')
  RETURNING id INTO v_lead;
  INSERT INTO pulse_producoes (empresa_id, produto_final_id, produto_final_nome, quantidade_produzida, custo_total, status, previsao_entrega, responsavel_id, lead_id, etapa_fabricacao_idx, user_id, created_at)
  VALUES (v_emp, (SELECT id FROM servicos WHERE empresa_id = v_emp AND nome = 'Sistema de Conversão — Grelha Móvel p/ Fornalha de Alvenaria' LIMIT 1),
    'Sistema de Conversão — Grelha Móvel p/ Fornalha de Alvenaria', 1, 0, 'em_producao', '2026-12-10', v_users[1], v_lead, 0, v_users[1], '2026-09-09 08:00:00-03')
  RETURNING id INTO v_prod;
  INSERT INTO pulse_producao_eventos (producao_id, tipo, texto, user_id, created_at) VALUES (v_prod, 'status', 'Produção iniciada', v_users[1], '2026-09-09 08:00:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES
    ('VENDA Cooperativa Grãos do Oeste - Entrada 30% (DEMO-L27)', 131100, 'entrada', 'vendas', 'pago', '2026-09-10', '2026-09-10', false, 'DEMO', v_users[1], v_emp);
  FOR i IN 1..6 LOOP
    INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id)
    VALUES ('VENDA Cooperativa Grãos do Oeste - Parcela ' || i || '/6 (DEMO-L27)', 50983.33, 'entrada', 'vendas', 'pendente', (DATE '2026-09-10' + (i || ' month')::interval)::date, NULL, false, 'DEMO', v_users[1], v_emp);
  END LOOP;

  -- ---------- Venda 2: Frigorífico Serra Azul — alimentação + silo, fechada em 15/09 ----------
  v_u := v_users[LEAST(3, array_length(v_users, 1))];
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, created_at)
  VALUES ('Frigorífico Serra Azul', '(49) 3442-1010', '11.111.110/0001-10', 'Concórdia', 221000, 0,
    '[{"servico":"Sistema de Alimentação de Biomassa","quantidade":1,"precoBase":175000,"precoUnitario":175000,"capacidade":"Moega + peneira + silo","observacao":"Cavaco","configuracoes":[]},{"servico":"Silo Dosador com Roscas","quantidade":1,"precoBase":46000,"precoUnitario":46000,"capacidade":"12 m³","observacao":"","configuracoes":[]}]'::jsonb,
    'ganho', 4, 'Direto', 'demo_seed', 'boleto', '7', 'DEMO-L28 · Frigorífico — alimentação de caldeira, fechou em 15/09.',
    (SELECT id FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Frigorífico Serra Azul' AND observacao_risco = 'DEMO-SEED' LIMIT 1),
    v_emp, v_u, v_u, v_u, 0, '2026-09-15 14:00:00-03')
  RETURNING id INTO v_lead;
  INSERT INTO pulse_producoes (empresa_id, produto_final_id, produto_final_nome, quantidade_produzida, custo_total, status, previsao_entrega, responsavel_id, lead_id, etapa_fabricacao_idx, user_id, created_at)
  VALUES (v_emp, (SELECT id FROM servicos WHERE empresa_id = v_emp AND nome = 'Sistema de Alimentação de Biomassa' LIMIT 1),
    'Sistema de Alimentação de Biomassa', 1, 0, 'em_producao', '2026-12-05', v_users[1], v_lead, 0, v_users[1], '2026-09-18 08:00:00-03')
  RETURNING id INTO v_prod;
  INSERT INTO pulse_producao_eventos (producao_id, tipo, texto, user_id, created_at) VALUES (v_prod, 'status', 'Produção iniciada', v_users[1], '2026-09-18 08:00:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES
    ('VENDA Frigorífico Serra Azul - Entrada 30% (DEMO-L28)', 66300, 'entrada', 'vendas', 'pago', '2026-09-18', '2026-09-18', false, 'DEMO', v_users[1], v_emp);
  FOR i IN 1..6 LOOP
    INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id)
    VALUES ('VENDA Frigorífico Serra Azul - Parcela ' || i || '/6 (DEMO-L28)', 25783.33, 'entrada', 'vendas', 'pendente', (DATE '2026-09-18' + (i || ' month')::interval)::date, NULL, false, 'DEMO', v_users[1], v_emp);
  END LOOP;

  -- ---------- Visitas de setembro (ranking/relatórios de visita) ----------
  i := 0;
  FOR v_cli IN SELECT nome_empresa, telefone FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED' ORDER BY nome_empresa LOOP
    i := i + 1;
    INSERT INTO visitas (empresa, telefone, observacao, user_id, empresa_id, created_at)
    VALUES (v_cli.nome_empresa, v_cli.telefone, 'DEMO-SEED — visita comercial / levantamento técnico',
            v_users[LEAST((i % 3) + 1, array_length(v_users, 1))], v_emp,
            (TIMESTAMPTZ '2026-09-02 09:30:00-03' + ((i * 30) || ' hours')::interval));
    IF i <= 2 THEN
      INSERT INTO visitas (empresa, telefone, observacao, user_id, empresa_id, created_at)
      VALUES (v_cli.nome_empresa, v_cli.telefone, 'DEMO-SEED — retorno com proposta',
              v_users[1], v_emp, (TIMESTAMPTZ '2026-09-16 15:00:00-03' + ((i * 5) || ' hours')::interval));
    END IF;
  END LOOP;
END $comp$;
