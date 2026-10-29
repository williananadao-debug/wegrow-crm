-- DADOS FICTÍCIOS de demonstração da RBN 94,3 (piloto pra apresentações).
-- NÃO é migration de schema — é carga de dados. Rode UMA vez no SQL Editor do Supabase.
-- Tudo é marcado (leads.origem='demo_seed', clientes.observacao_risco='DEMO-SEED',
-- servicos.descricao 'DEMO-SEED…', jobs.briefing com 'DEMO-SEED', lancamentos.nf_numero='DEMO',
-- metas só criadas se a empresa não tinha nenhuma) e sai inteiro com
-- 20261029110100_DEMO_rbn_limpar_dados_ficticios.sql. Nomes, CNPJs e valores são inventados.

DO $demo$
DECLARE
  v_emp uuid;
  v_count int;
  v_users uuid[];
  v_nomes text[];
  v_unid text[];
  v_u uuid;
  v_lead bigint;
  v_cli bigint;
BEGIN
  SELECT count(*) INTO v_count FROM empresas WHERE nome ILIKE '%rbn%';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Esperava 1 empresa com "RBN" no nome, achou %. Ajuste o filtro.', v_count; END IF;
  SELECT id INTO v_emp FROM empresas WHERE nome ILIKE '%rbn%';
  IF EXISTS (SELECT 1 FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed') THEN RAISE EXCEPTION 'Dados fictícios já carregados — rode o script de limpeza antes de recarregar.'; END IF;
  v_users := ARRAY(SELECT id FROM profiles WHERE empresa_id = v_emp ORDER BY (cargo = 'diretor') DESC, id);
  IF array_length(v_users, 1) IS NULL THEN RAISE EXCEPTION 'A RBN não tem nenhum usuário em profiles — crie pelo menos o diretor antes.'; END IF;
  -- Vendedores fictícios no nome (o dono do lead é sempre um usuário real da RBN).
  v_nomes := ARRAY['Carla Mendes', 'Rafael Souza', 'Juliana Prates'];
  v_unid := ARRAY(SELECT nome FROM unidades WHERE empresa_id = v_emp ORDER BY nome);
  IF array_length(v_unid, 1) IS NULL THEN v_unid := ARRAY['RBN 94,3']; END IF;

  -- Catálogo de mídia
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Spot 30" rotativo', 28.0, 'Mídia', 'Inserção', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Spot 15" rotativo', 18.0, 'Mídia', 'Inserção', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Spot 30" horário nobre (6h-9h)', 45.0, 'Mídia', 'Inserção', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Testemunhal ao vivo', 90.0, 'Mídia', 'Inserção', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Patrocínio de programa (mensal)', 2400.0, 'Mídia', 'Mês', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Vinheta de hora certa (mensal)', 1500.0, 'Mídia', 'Mês', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Blitz / ação externa', 1200.0, 'Mídia', 'Ação', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Produção de spot (gravação + edição)', 250.0, 'Mídia', 'Peça', 'DEMO-SEED — dado fictício de demonstração', v_emp);
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id) VALUES ('Post patrocinado Instagram RBN', 350.0, 'Mídia', 'Post', 'DEMO-SEED — dado fictício de demonstração', v_emp);

  -- Anunciantes
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Supermercado Bom Preço', 'Supermercado Bom Preço Ltda', '(47) 3521-1037', '22.222.201/0001-01', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Varejo alimentar', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Farmácia Vida & Saúde', 'Farmácia Vida & Saúde Ltda', '(47) 3522-1074', '22.222.202/0001-02', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Farmácia', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Auto Center Vale', 'Auto Center Vale Ltda', '(47) 3523-1111', '22.222.203/0001-03', 'Ibirama', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Automotivo', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Móveis Rainha', 'Móveis Rainha Ltda', '(47) 3524-1148', '22.222.204/0001-04', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Móveis', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Clínica Odonto Sorriso', 'Clínica Odonto Sorriso Ltda', '(47) 3525-1185', '22.222.205/0001-05', 'Ituporanga', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Saúde', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Agropecuária Campo Forte', 'Agropecuária Campo Forte Ltda', '(47) 3526-1222', '22.222.206/0001-06', 'Ituporanga', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Agro', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Imobiliária Horizonte', 'Imobiliária Horizonte Ltda', '(47) 3527-1259', '22.222.207/0001-07', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Imobiliário', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Ótica Visão Clara', 'Ótica Visão Clara Ltda', '(47) 3528-1296', '22.222.208/0001-08', 'Taió', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Varejo', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Construmais Materiais', 'Construmais Materiais Ltda', '(47) 3529-1333', '22.222.209/0001-09', 'Pouso Redondo', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Construção', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Pizzaria Forno a Lenha', 'Pizzaria Forno a Lenha Ltda', '(47) 3530-1370', '22.222.210/0001-10', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Alimentação', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Academia Corpo em Forma', 'Academia Corpo em Forma Ltda', '(47) 3531-1407', '22.222.211/0001-11', 'Ibirama', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Fitness', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Concessionária Vale Motors', 'Concessionária Vale Motors Ltda', '(47) 3532-1444', '22.222.212/0001-12', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Automotivo', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Escola de Idiomas Fluent', 'Escola de Idiomas Fluent Ltda', '(47) 3533-1481', '22.222.213/0001-13', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Educação', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Cooperativa de Crédito Alto Vale', 'Cooperativa de Crédito Alto Vale Ltda', '(47) 3534-1518', '22.222.214/0001-14', 'Taió', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Financeiro', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Loja Moda Jovem', 'Loja Moda Jovem Ltda', '(47) 3535-1555', '22.222.215/0001-15', 'Ituporanga', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Vestuário', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Posto Estrela', 'Posto Estrela Ltda', '(47) 3536-1592', '22.222.216/0001-16', 'Pouso Redondo', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Combustíveis', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Pet Shop Amigo Fiel', 'Pet Shop Amigo Fiel Ltda', '(47) 3537-1629', '22.222.217/0001-17', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Pet', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Faculdade Vale Educação', 'Faculdade Vale Educação Ltda', '(47) 3538-1666', '22.222.218/0001-18', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Educação', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Eletro Center', 'Eletro Center Ltda', '(47) 3539-1703', '22.222.219/0001-19', 'Ibirama', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Eletro', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Laboratório Análises Vida', 'Laboratório Análises Vida Ltda', '(47) 3540-1740', '22.222.220/0001-20', 'Taió', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Saúde', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Agência Criativa Propaganda', 'Agência Criativa Propaganda Ltda', '(47) 3541-1777', '22.222.221/0001-21', 'Rio do Sul', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Agência', v_users[1], v_emp);
  INSERT INTO clientes (nome_empresa, razao_social, telefone, cnpj, cidade, estado, status, status_risco, limite_credito, score_interno, observacao_risco, segmento, user_id, empresa_id) VALUES ('Panificadora Pão Quente', 'Panificadora Pão Quente Ltda', '(47) 3542-1814', '22.222.222/0001-22', 'Ituporanga', 'SC', 'ativo', 'verde', 0, 0, 'DEMO-SEED', 'Alimentação', v_users[1], v_emp);

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Supermercado Bom Preço' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Supermercado Bom Preço', '(47) 3521-1037', '22.222.201/0001-01', 'Rio do Sul', 5760.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 120, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '6', 'DEMO-RBN01 · Campanha semestral de ofertas da semana.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], '2026-06-12', '2026-12-08', NULL, '[{"id": 100, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-06-04T10:00:00-03:00"}, {"id": 101, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-06-07T10:00:00-03:00"}, {"id": 102, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-06-09T10:00:00-03:00"}, {"id": 103, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-06-09T10:00:00-03:00"}]'::jsonb, '2026-06-02 09:30:00-03', '2026-06-09 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Supermercado Bom Preço', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 120x Spot 30" rotativo, 1x Patrocínio de programa (mensal)' || E'
' || 'Valor Final: R$ 5760.00' || E'

' || 'Resumo da OPEC: Campanha semestral de ofertas da semana.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-06-11 18:00:00-03', 'Supermercado Bom Preço', NULL, '2026-06-12', '2026-12-08', '[{"servico": "Spot 30\" rotativo", "quantidade": 120, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}]'::jsonb, v_nomes[1], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-06-09 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Supermercado Bom Preço — parcela 1/6', 960.0, 'entrada', 'vendas', 'pago', '2026-06-12', '2026-06-12', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Supermercado Bom Preço — parcela 2/6', 960.0, 'entrada', 'vendas', 'pago', '2026-07-12', '2026-07-12', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Supermercado Bom Preço — parcela 3/6', 960.0, 'entrada', 'vendas', 'pago', '2026-08-11', '2026-08-11', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Supermercado Bom Preço — parcela 4/6', 960.0, 'entrada', 'vendas', 'pago', '2026-09-10', '2026-09-10', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Supermercado Bom Preço — parcela 5/6', 960.0, 'entrada', 'vendas', 'pago', '2026-10-10', '2026-10-10', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Supermercado Bom Preço — parcela 6/6', 960.0, 'entrada', 'vendas', 'pendente', '2026-11-09', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Farmácia Vida & Saúde' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Farmácia Vida & Saúde', '(47) 3522-1074', '22.222.202/0001-02', 'Rio do Sul', 3020.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 90, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 2, "precoUnitario": 250.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '3', 'DEMO-RBN02 · Plantão 24h e entrega grátis.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[2], '2026-06-19', '2026-09-16', NULL, '[{"id": 200, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-06-07T10:00:00-03:00"}, {"id": 201, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-06-10T10:00:00-03:00"}, {"id": 202, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-06-13T10:00:00-03:00"}, {"id": 203, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-06-16T10:00:00-03:00"}]'::jsonb, '2026-06-05 09:30:00-03', '2026-06-16 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Farmácia Vida & Saúde', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 90x Spot 30" rotativo, 2x Produção de spot (gravação + edição)' || E'
' || 'Valor Final: R$ 3020.00' || E'

' || 'Resumo da OPEC: Plantão 24h e entrega grátis.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-06-18 18:00:00-03', 'Farmácia Vida & Saúde', NULL, '2026-06-19', '2026-09-16', '[{"servico": "Spot 30\" rotativo", "quantidade": 90, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 2, "precoUnitario": 250.0}]'::jsonb, v_nomes[2], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-06-16 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Farmácia Vida & Saúde — parcela 1/3', 1006.67, 'entrada', 'vendas', 'pago', '2026-06-19', '2026-06-19', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Farmácia Vida & Saúde — parcela 2/3', 1006.67, 'entrada', 'vendas', 'pago', '2026-07-19', '2026-07-19', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Farmácia Vida & Saúde — parcela 3/3', 1006.67, 'entrada', 'vendas', 'pago', '2026-08-18', '2026-08-18', false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Auto Center Vale' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Auto Center Vale', '(47) 3523-1111', '22.222.203/0001-03', 'Ibirama', 3360.0, 0, '[{"servico": "Spot 15\" rotativo", "quantidade": 120, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Blitz / ação externa", "quantidade": 1, "precoUnitario": 1200.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '2', 'DEMO-RBN03 · Revisão de férias + blitz no pátio.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[3], '2026-06-29', '2026-08-27', NULL, '[{"id": 300, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-06-14T10:00:00-03:00"}, {"id": 301, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-06-17T10:00:00-03:00"}, {"id": 302, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-06-20T10:00:00-03:00"}, {"id": 303, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-06-26T10:00:00-03:00"}]'::jsonb, '2026-06-12 09:30:00-03', '2026-06-26 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Auto Center Vale', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 120x Spot 15" rotativo, 1x Blitz / ação externa' || E'
' || 'Valor Final: R$ 3360.00' || E'

' || 'Resumo da OPEC: Revisão de férias + blitz no pátio.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-06-28 18:00:00-03', 'Auto Center Vale', NULL, '2026-06-29', '2026-08-27', '[{"servico": "Spot 15\" rotativo", "quantidade": 120, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Blitz / ação externa", "quantidade": 1, "precoUnitario": 1200.0}]'::jsonb, v_nomes[3], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-06-26 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Auto Center Vale — parcela 1/2', 1680.0, 'entrada', 'vendas', 'pago', '2026-06-29', '2026-06-29', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Auto Center Vale — parcela 2/2', 1680.0, 'entrada', 'vendas', 'pago', '2026-07-29', '2026-07-29', false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Móveis Rainha' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Móveis Rainha', '(47) 3524-1148', '22.222.204/0001-04', 'Rio do Sul', 3600.0, 0, '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 60, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Testemunhal ao vivo", "quantidade": 10, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '3', 'DEMO-RBN04 · Feirão de inverno.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], '2026-07-11', '2026-10-08', NULL, '[{"id": 400, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-07-03T10:00:00-03:00"}, {"id": 401, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-07-06T10:00:00-03:00"}, {"id": 402, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-07-08T10:00:00-03:00"}, {"id": 403, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-07-08T10:00:00-03:00"}]'::jsonb, '2026-07-01 09:30:00-03', '2026-07-08 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Móveis Rainha', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 60x Spot 30" horário nobre (6h-9h), 10x Testemunhal ao vivo' || E'
' || 'Valor Final: R$ 3600.00' || E'

' || 'Resumo da OPEC: Feirão de inverno.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-07-10 18:00:00-03', 'Móveis Rainha', NULL, '2026-07-11', '2026-10-08', '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 60, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Testemunhal ao vivo", "quantidade": 10, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}]'::jsonb, v_nomes[1], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-07-08 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Móveis Rainha — parcela 1/3', 1200.0, 'entrada', 'vendas', 'pago', '2026-07-11', '2026-07-11', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Móveis Rainha — parcela 2/3', 1200.0, 'entrada', 'vendas', 'pago', '2026-08-10', '2026-08-10', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Móveis Rainha — parcela 3/3', 1200.0, 'entrada', 'vendas', 'pago', '2026-09-09', '2026-09-09', false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Clínica Odonto Sorriso' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Clínica Odonto Sorriso', '(47) 3525-1185', '22.222.205/0001-05', 'Ituporanga', 1680.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 60, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, 'perdido', 5, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN05 · Optou por mídia digital neste semestre.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[2], NULL, NULL, NULL, '[{"id": 500, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-07-05T10:00:00-03:00"}, {"id": 501, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-07-08T10:00:00-03:00"}, {"id": 502, "tipo": "etapa", "descricao": "Movido para Perdidos", "created_at": "2026-07-20T10:00:00-03:00"}, {"id": 509, "tipo": "nota", "descricao": "Optou por mídia digital neste semestre.", "created_at": "2026-07-20T10:05:00-03:00"}]'::jsonb, '2026-07-03 09:30:00-03', '2026-07-20 16:00:00-03')
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Agropecuária Campo Forte' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Agropecuária Campo Forte', '(47) 3526-1222', '22.222.206/0001-06', 'Ituporanga', 4080.0, 0, '[{"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}, {"servico": "Spot 30\" rotativo", "quantidade": 60, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '6', 'DEMO-RBN06 · Patrocínio do programa rural.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[3], '2026-07-25', '2027-01-20', NULL, '[{"id": 600, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-07-12T10:00:00-03:00"}, {"id": 601, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-07-15T10:00:00-03:00"}, {"id": 602, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-07-18T10:00:00-03:00"}, {"id": 603, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-07-22T10:00:00-03:00"}]'::jsonb, '2026-07-10 09:30:00-03', '2026-07-22 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Agropecuária Campo Forte', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 1x Patrocínio de programa (mensal), 60x Spot 30" rotativo' || E'
' || 'Valor Final: R$ 4080.00' || E'

' || 'Resumo da OPEC: Patrocínio do programa rural.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-07-24 18:00:00-03', 'Agropecuária Campo Forte', NULL, '2026-07-25', '2027-01-20', '[{"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}, {"servico": "Spot 30\" rotativo", "quantidade": 60, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, v_nomes[3], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-07-22 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Agropecuária Campo Forte — parcela 1/6', 680.0, 'entrada', 'vendas', 'pago', '2026-07-25', '2026-07-25', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Agropecuária Campo Forte — parcela 2/6', 680.0, 'entrada', 'vendas', 'pago', '2026-08-24', '2026-08-24', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Agropecuária Campo Forte — parcela 3/6', 680.0, 'entrada', 'vendas', 'pago', '2026-09-23', '2026-09-23', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Agropecuária Campo Forte — parcela 4/6', 680.0, 'entrada', 'vendas', 'pago', '2026-10-23', '2026-10-23', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Agropecuária Campo Forte — parcela 5/6', 680.0, 'entrada', 'vendas', 'pendente', '2026-11-22', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Agropecuária Campo Forte — parcela 6/6', 680.0, 'entrada', 'vendas', 'pendente', '2026-12-22', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Imobiliária Horizonte' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Imobiliária Horizonte', '(47) 3527-1259', '22.222.207/0001-07', 'Rio do Sul', 4530.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 150, "precoUnitario": 25.2, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 3, "precoUnitario": 250.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '3', 'DEMO-RBN07 · Lançamento de loteamento.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], '2026-08-01', '2026-10-29', NULL, '[{"id": 700, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-07-16T10:00:00-03:00"}, {"id": 701, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-07-19T10:00:00-03:00"}, {"id": 702, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-07-22T10:00:00-03:00"}, {"id": 703, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-07-29T10:00:00-03:00"}]'::jsonb, '2026-07-14 09:30:00-03', '2026-07-29 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Imobiliária Horizonte', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 150x Spot 30" rotativo, 3x Produção de spot (gravação + edição)' || E'
' || 'Valor Final: R$ 4530.00' || E'

' || 'Resumo da OPEC: Lançamento de loteamento.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-07-31 18:00:00-03', 'Imobiliária Horizonte', NULL, '2026-08-01', '2026-10-29', '[{"servico": "Spot 30\" rotativo", "quantidade": 150, "precoUnitario": 25.2, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 3, "precoUnitario": 250.0}]'::jsonb, v_nomes[1], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-07-29 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Imobiliária Horizonte — parcela 1/3', 1510.0, 'entrada', 'vendas', 'pago', '2026-08-01', '2026-08-01', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Imobiliária Horizonte — parcela 2/3', 1510.0, 'entrada', 'vendas', 'pago', '2026-08-31', '2026-08-31', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Imobiliária Horizonte — parcela 3/3', 1510.0, 'entrada', 'vendas', 'pago', '2026-09-30', '2026-09-30', false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Ótica Visão Clara' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Ótica Visão Clara', '(47) 3528-1296', '22.222.208/0001-08', 'Taió', 2320.0, 0, '[{"servico": "Spot 15\" rotativo", "quantidade": 90, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Post patrocinado Instagram RBN", "quantidade": 2, "precoUnitario": 350.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '2', 'DEMO-RBN08 · Dia dos Pais — óculos de sol.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[2], '2026-08-15', '2026-10-13', NULL, '[{"id": 800, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-08-06T10:00:00-03:00"}, {"id": 801, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-08-09T10:00:00-03:00"}, {"id": 802, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-08-12T10:00:00-03:00"}, {"id": 803, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-08-12T10:00:00-03:00"}]'::jsonb, '2026-08-04 09:30:00-03', '2026-08-12 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Ótica Visão Clara', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 90x Spot 15" rotativo, 2x Post patrocinado Instagram RBN' || E'
' || 'Valor Final: R$ 2320.00' || E'

' || 'Resumo da OPEC: Dia dos Pais — óculos de sol.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-08-14 18:00:00-03', 'Ótica Visão Clara', NULL, '2026-08-15', '2026-10-13', '[{"servico": "Spot 15\" rotativo", "quantidade": 90, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Post patrocinado Instagram RBN", "quantidade": 2, "precoUnitario": 350.0}]'::jsonb, v_nomes[2], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-08-12 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Ótica Visão Clara — parcela 1/2', 1160.0, 'entrada', 'vendas', 'pago', '2026-08-15', '2026-08-15', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Ótica Visão Clara — parcela 2/2', 1160.0, 'entrada', 'vendas', 'pago', '2026-09-14', '2026-09-14', false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Construmais Materiais' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Construmais Materiais', '(47) 3529-1333', '22.222.209/0001-09', 'Pouso Redondo', 4860.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 120, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Vinheta de hora certa (mensal)", "quantidade": 1, "precoUnitario": 1500.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '6', 'DEMO-RBN09 · Hora certa Construmais.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[3], '2026-08-22', '2027-02-17', NULL, '[{"id": 900, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-08-08T10:00:00-03:00"}, {"id": 901, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-08-11T10:00:00-03:00"}, {"id": 902, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-08-14T10:00:00-03:00"}, {"id": 903, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-08-19T10:00:00-03:00"}]'::jsonb, '2026-08-06 09:30:00-03', '2026-08-19 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Construmais Materiais', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 120x Spot 30" rotativo, 1x Vinheta de hora certa (mensal)' || E'
' || 'Valor Final: R$ 4860.00' || E'

' || 'Resumo da OPEC: Hora certa Construmais.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-08-21 18:00:00-03', 'Construmais Materiais', NULL, '2026-08-22', '2027-02-17', '[{"servico": "Spot 30\" rotativo", "quantidade": 120, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Vinheta de hora certa (mensal)", "quantidade": 1, "precoUnitario": 1500.0}]'::jsonb, v_nomes[3], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-08-19 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Construmais Materiais — parcela 1/6', 810.0, 'entrada', 'vendas', 'pago', '2026-08-22', '2026-08-22', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Construmais Materiais — parcela 2/6', 810.0, 'entrada', 'vendas', 'pago', '2026-09-21', '2026-09-21', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Construmais Materiais — parcela 3/6', 810.0, 'entrada', 'vendas', 'pago', '2026-10-21', '2026-10-21', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Construmais Materiais — parcela 4/6', 810.0, 'entrada', 'vendas', 'pendente', '2026-11-20', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Construmais Materiais — parcela 5/6', 810.0, 'entrada', 'vendas', 'pendente', '2026-12-20', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Construmais Materiais — parcela 6/6', 810.0, 'entrada', 'vendas', 'pendente', '2027-01-19', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Pizzaria Forno a Lenha' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Pizzaria Forno a Lenha', '(47) 3530-1370', '22.222.210/0001-10', 'Rio do Sul', 1080.0, 0, '[{"servico": "Spot 15\" rotativo", "quantidade": 60, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}]'::jsonb, 'perdido', 5, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN10 · Achou o investimento alto para o momento.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], NULL, NULL, NULL, '[{"id": 1000, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-08-12T10:00:00-03:00"}, {"id": 1001, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-08-15T10:00:00-03:00"}, {"id": 1002, "tipo": "etapa", "descricao": "Movido para Perdidos", "created_at": "2026-08-28T10:00:00-03:00"}, {"id": 1009, "tipo": "nota", "descricao": "Achou o investimento alto para o momento.", "created_at": "2026-08-28T10:05:00-03:00"}]'::jsonb, '2026-08-10 09:30:00-03', '2026-08-28 16:00:00-03')
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Academia Corpo em Forma' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Academia Corpo em Forma', '(47) 3531-1407', '22.222.211/0001-11', 'Ibirama', 2760.0, 0, '[{"servico": "Testemunhal ao vivo", "quantidade": 12, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Spot 30\" rotativo", "quantidade": 60, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '2', 'DEMO-RBN11 · Matrículas de primavera.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[2], '2026-08-30', '2026-10-28', NULL, '[{"id": 1100, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-08-20T10:00:00-03:00"}, {"id": 1101, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-08-23T10:00:00-03:00"}, {"id": 1102, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-08-26T10:00:00-03:00"}, {"id": 1103, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-08-27T10:00:00-03:00"}]'::jsonb, '2026-08-18 09:30:00-03', '2026-08-27 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Academia Corpo em Forma', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 12x Testemunhal ao vivo, 60x Spot 30" rotativo' || E'
' || 'Valor Final: R$ 2760.00' || E'

' || 'Resumo da OPEC: Matrículas de primavera.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-08-29 18:00:00-03', 'Academia Corpo em Forma', NULL, '2026-08-30', '2026-10-28', '[{"servico": "Testemunhal ao vivo", "quantidade": 12, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Spot 30\" rotativo", "quantidade": 60, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, v_nomes[2], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-08-27 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Academia Corpo em Forma — parcela 1/2', 1380.0, 'entrada', 'vendas', 'pago', '2026-08-30', '2026-08-30', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Academia Corpo em Forma — parcela 2/2', 1380.0, 'entrada', 'vendas', 'pago', '2026-09-29', '2026-09-29', false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Concessionária Vale Motors' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Concessionária Vale Motors', '(47) 3532-1444', '22.222.212/0001-12', 'Rio do Sul', 7837.5, 412.5, '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 90, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Testemunhal ao vivo", "quantidade": 20, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Blitz / ação externa", "quantidade": 2, "precoUnitario": 1200.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '3', 'DEMO-RBN12 · Feirão de seminovos.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[3], '2026-09-13', '2026-12-11', NULL, '[{"id": 1200, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-09-03T10:00:00-03:00"}, {"id": 1201, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-09-06T10:00:00-03:00"}, {"id": 1202, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-09-09T10:00:00-03:00"}, {"id": 1203, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-09-10T10:00:00-03:00"}]'::jsonb, '2026-09-01 09:30:00-03', '2026-09-10 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Concessionária Vale Motors', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 90x Spot 30" horário nobre (6h-9h), 20x Testemunhal ao vivo, 2x Blitz / ação externa' || E'
' || 'Valor Final: R$ 7837.50' || E'

' || 'Resumo da OPEC: Feirão de seminovos.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'entregue', 'media', '2026-09-12 18:00:00-03', 'Concessionária Vale Motors', NULL, '2026-09-13', '2026-12-11', '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 90, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Testemunhal ao vivo", "quantidade": 20, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Blitz / ação externa", "quantidade": 2, "precoUnitario": 1200.0}]'::jsonb, v_nomes[3], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-09-10 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Concessionária Vale Motors — parcela 1/3', 2612.5, 'entrada', 'vendas', 'pago', '2026-09-13', '2026-09-13', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Concessionária Vale Motors — parcela 2/3', 2612.5, 'entrada', 'vendas', 'pago', '2026-10-13', '2026-10-13', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Concessionária Vale Motors — parcela 3/3', 2612.5, 'entrada', 'vendas', 'pendente', '2026-11-12', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Escola de Idiomas Fluent' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Escola de Idiomas Fluent', '(47) 3533-1481', '22.222.213/0001-13', 'Rio do Sul', 2856.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 120, "precoUnitario": 23.8, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, 'ganho', 4, 'Agência', 'demo_seed', 'boleto', '4', 'DEMO-RBN13 · Via Agência Criativa — rematrículas.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], '2026-09-18', '2027-01-15', NULL, '[{"id": 1300, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-09-05T10:00:00-03:00"}, {"id": 1301, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-09-08T10:00:00-03:00"}, {"id": 1302, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-09-11T10:00:00-03:00"}, {"id": 1303, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-09-15T10:00:00-03:00"}]'::jsonb, '2026-09-03 09:30:00-03', '2026-09-15 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Escola de Idiomas Fluent', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 120x Spot 30" rotativo' || E'
' || 'Valor Final: R$ 2856.00' || E'

' || 'Resumo da OPEC: Via Agência Criativa — rematrículas.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'aprovacao', 'media', '2026-09-17 18:00:00-03', 'Escola de Idiomas Fluent', 'Escola de Idiomas Fluent', '2026-09-18', '2027-01-15', '[{"servico": "Spot 30\" rotativo", "quantidade": 120, "precoUnitario": 23.8, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, v_nomes[1], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-09-15 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Escola de Idiomas Fluent — parcela 1/4', 714.0, 'entrada', 'vendas', 'pago', '2026-09-18', '2026-09-18', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Escola de Idiomas Fluent — parcela 2/4', 714.0, 'entrada', 'vendas', 'pago', '2026-10-18', '2026-10-18', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Escola de Idiomas Fluent — parcela 3/4', 714.0, 'entrada', 'vendas', 'pendente', '2026-11-17', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Escola de Idiomas Fluent — parcela 4/4', 714.0, 'entrada', 'vendas', 'pendente', '2026-12-17', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Cooperativa de Crédito Alto Vale' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Cooperativa de Crédito Alto Vale', '(47) 3534-1518', '22.222.214/0001-14', 'Taió', 5600.0, 0, '[{"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}, {"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 60, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 2, "precoUnitario": 250.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '12', 'DEMO-RBN14 · Contrato anual — programa de notícias.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[2], '2026-09-27', '2027-09-21', NULL, '[{"id": 1400, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-09-10T10:00:00-03:00"}, {"id": 1401, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-09-13T10:00:00-03:00"}, {"id": 1402, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-09-16T10:00:00-03:00"}, {"id": 1403, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-09-24T10:00:00-03:00"}]'::jsonb, '2026-09-08 09:30:00-03', '2026-09-24 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Cooperativa de Crédito Alto Vale', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 1x Patrocínio de programa (mensal), 60x Spot 30" horário nobre (6h-9h), 2x Produção de spot (gravação + edição)' || E'
' || 'Valor Final: R$ 5600.00' || E'

' || 'Resumo da OPEC: Contrato anual — programa de notícias.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'aprovacao', 'media', '2026-09-26 18:00:00-03', 'Cooperativa de Crédito Alto Vale', NULL, '2026-09-27', '2027-09-21', '[{"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}, {"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 60, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 2, "precoUnitario": 250.0}]'::jsonb, v_nomes[2], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-09-24 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 1/12', 466.67, 'entrada', 'vendas', 'pago', '2026-09-27', '2026-09-27', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 2/12', 466.67, 'entrada', 'vendas', 'pago', '2026-10-27', '2026-10-27', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 3/12', 466.67, 'entrada', 'vendas', 'pendente', '2026-11-26', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 4/12', 466.67, 'entrada', 'vendas', 'pendente', '2026-12-26', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 5/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-01-25', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 6/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-02-24', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 7/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-03-26', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 8/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-04-25', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 9/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-05-25', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 10/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-06-24', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 11/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-07-24', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Cooperativa de Crédito Alto Vale — parcela 12/12', 466.67, 'entrada', 'vendas', 'pendente', '2027-08-23', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Loja Moda Jovem' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Loja Moda Jovem', '(47) 3535-1555', '22.222.215/0001-15', 'Ituporanga', 2670.0, 0, '[{"servico": "Spot 15\" rotativo", "quantidade": 90, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Post patrocinado Instagram RBN", "quantidade": 3, "precoUnitario": 350.0}]'::jsonb, 'perdido', 5, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN15 · Fechou com concorrente.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[3], NULL, NULL, NULL, '[{"id": 1500, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-09-14T10:00:00-03:00"}, {"id": 1501, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-09-17T10:00:00-03:00"}, {"id": 1502, "tipo": "etapa", "descricao": "Movido para Perdidos", "created_at": "2026-09-30T10:00:00-03:00"}, {"id": 1509, "tipo": "nota", "descricao": "Fechou com concorrente.", "created_at": "2026-09-30T10:05:00-03:00"}]'::jsonb, '2026-09-12 09:30:00-03', '2026-09-30 16:00:00-03')
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Posto Estrela' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Posto Estrela', '(47) 3536-1592', '22.222.216/0001-16', 'Pouso Redondo', 4020.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 90, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Vinheta de hora certa (mensal)", "quantidade": 1, "precoUnitario": 1500.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '6', 'DEMO-RBN16 · Promoção abastece e concorre.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[1], '2026-10-05', '2027-04-02', NULL, '[{"id": 1600, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-09-22T10:00:00-03:00"}, {"id": 1601, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-09-25T10:00:00-03:00"}, {"id": 1602, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-09-28T10:00:00-03:00"}, {"id": 1603, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-10-02T10:00:00-03:00"}]'::jsonb, '2026-09-20 09:30:00-03', '2026-10-02 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Posto Estrela', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 90x Spot 30" rotativo, 1x Vinheta de hora certa (mensal)' || E'
' || 'Valor Final: R$ 4020.00' || E'

' || 'Resumo da OPEC: Promoção abastece e concorre.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'aprovacao', 'media', '2026-10-04 18:00:00-03', 'Posto Estrela', NULL, '2026-10-05', '2027-04-02', '[{"servico": "Spot 30\" rotativo", "quantidade": 90, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Vinheta de hora certa (mensal)", "quantidade": 1, "precoUnitario": 1500.0}]'::jsonb, v_nomes[1], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-10-02 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Posto Estrela — parcela 1/6', 670.0, 'entrada', 'vendas', 'pago', '2026-10-05', '2026-10-05', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Posto Estrela — parcela 2/6', 670.0, 'entrada', 'vendas', 'pendente', '2026-11-04', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Posto Estrela — parcela 3/6', 670.0, 'entrada', 'vendas', 'pendente', '2026-12-04', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Posto Estrela — parcela 4/6', 670.0, 'entrada', 'vendas', 'pendente', '2027-01-03', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Posto Estrela — parcela 5/6', 670.0, 'entrada', 'vendas', 'pendente', '2027-02-02', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Posto Estrela — parcela 6/6', 670.0, 'entrada', 'vendas', 'pendente', '2027-03-04', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Pet Shop Amigo Fiel' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Pet Shop Amigo Fiel', '(47) 3537-1629', '22.222.217/0001-17', 'Rio do Sul', 2860.0, 0, '[{"servico": "Spot 15\" rotativo", "quantidade": 120, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Post patrocinado Instagram RBN", "quantidade": 2, "precoUnitario": 350.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '2', 'DEMO-RBN17 · Banho e tosa — semana do pet.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[2], '2026-10-12', '2026-12-10', NULL, '[{"id": 1700, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-03T10:00:00-03:00"}, {"id": 1701, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-06T10:00:00-03:00"}, {"id": 1702, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-10-09T10:00:00-03:00"}, {"id": 1703, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-10-09T10:00:00-03:00"}]'::jsonb, '2026-10-01 09:30:00-03', '2026-10-09 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Pet Shop Amigo Fiel', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 120x Spot 15" rotativo, 2x Post patrocinado Instagram RBN' || E'
' || 'Valor Final: R$ 2860.00' || E'

' || 'Resumo da OPEC: Banho e tosa — semana do pet.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'aprovacao', 'media', '2026-10-11 18:00:00-03', 'Pet Shop Amigo Fiel', NULL, '2026-10-12', '2026-12-10', '[{"servico": "Spot 15\" rotativo", "quantidade": 120, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Post patrocinado Instagram RBN", "quantidade": 2, "precoUnitario": 350.0}]'::jsonb, v_nomes[2], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-10-09 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Pet Shop Amigo Fiel — parcela 1/2', 1430.0, 'entrada', 'vendas', 'pago', '2026-10-12', '2026-10-12', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Pet Shop Amigo Fiel — parcela 2/2', 1430.0, 'entrada', 'vendas', 'pendente', '2026-11-11', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Faculdade Vale Educação' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Faculdade Vale Educação', '(47) 3538-1666', '22.222.218/0001-18', 'Rio do Sul', 7125.0, 375.0, '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 120, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Testemunhal ao vivo", "quantidade": 15, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 3, "precoUnitario": 250.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '3', 'DEMO-RBN18 · Vestibular de verão.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[3], '2026-10-19', '2027-01-16', NULL, '[{"id": 1800, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-07T10:00:00-03:00"}, {"id": 1801, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-10T10:00:00-03:00"}, {"id": 1802, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-10-13T10:00:00-03:00"}, {"id": 1803, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-10-16T10:00:00-03:00"}]'::jsonb, '2026-10-05 09:30:00-03', '2026-10-16 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Faculdade Vale Educação', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 120x Spot 30" horário nobre (6h-9h), 15x Testemunhal ao vivo, 3x Produção de spot (gravação + edição)' || E'
' || 'Valor Final: R$ 7125.00' || E'

' || 'Resumo da OPEC: Vestibular de verão.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'edicao', 'media', '2026-10-18 18:00:00-03', 'Faculdade Vale Educação', NULL, '2026-10-19', '2027-01-16', '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 120, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Testemunhal ao vivo", "quantidade": 15, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 3, "precoUnitario": 250.0}]'::jsonb, v_nomes[3], v_unid[1 + (0 % array_length(v_unid, 1))], '2026-10-16 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Faculdade Vale Educação — parcela 1/3', 2375.0, 'entrada', 'vendas', 'pago', '2026-10-19', '2026-10-19', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Faculdade Vale Educação — parcela 2/3', 2375.0, 'entrada', 'vendas', 'pendente', '2026-11-18', NULL, false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Faculdade Vale Educação — parcela 3/3', 2375.0, 'entrada', 'vendas', 'pendente', '2026-12-18', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Eletro Center' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Eletro Center', '(47) 3539-1703', '22.222.219/0001-19', 'Ibirama', 4980.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 150, "precoUnitario": 25.2, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Blitz / ação externa", "quantidade": 1, "precoUnitario": 1200.0}]'::jsonb, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '2', 'DEMO-RBN19 · Black Friday antecipada.', v_cli, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[1], '2026-10-25', '2026-12-23', NULL, '[{"id": 1900, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-10T10:00:00-03:00"}, {"id": 1901, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-13T10:00:00-03:00"}, {"id": 1902, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-10-16T10:00:00-03:00"}, {"id": 1903, "tipo": "etapa", "descricao": "Movido para Ganhos", "created_at": "2026-10-22T10:00:00-03:00"}]'::jsonb, '2026-10-08 09:30:00-03', '2026-10-22 16:00:00-03')
    RETURNING id INTO v_lead;
  INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, agencia, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
    VALUES ('Gravação: Eletro Center', 'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || E'

' || 'Itens: 150x Spot 30" rotativo, 1x Blitz / ação externa' || E'
' || 'Valor Final: R$ 4980.00' || E'

' || 'Resumo da OPEC: Black Friday antecipada.' || E'

' || 'DEMO-SEED', v_cli, v_u, v_emp, 'gravacao', 'alta', '2026-10-24 18:00:00-03', 'Eletro Center', NULL, '2026-10-25', '2026-12-23', '[{"servico": "Spot 30\" rotativo", "quantidade": 150, "precoUnitario": 25.2, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Blitz / ação externa", "quantidade": 1, "precoUnitario": 1200.0}]'::jsonb, v_nomes[1], v_unid[1 + (1 % array_length(v_unid, 1))], '2026-10-22 16:30:00-03');
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Eletro Center — parcela 1/2', 2490.0, 'entrada', 'vendas', 'pago', '2026-10-25', '2026-10-25', false, 'DEMO', v_u, v_emp);
  INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id) VALUES ('VENDA: Eletro Center — parcela 2/2', 2490.0, 'entrada', 'vendas', 'pendente', '2026-11-24', NULL, false, 'DEMO', v_u, v_emp);

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Laboratório Análises Vida' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Laboratório Análises Vida', '(47) 3540-1740', '22.222.220/0001-20', 'Taió', 4920.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 90, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}]'::jsonb, 'aberto', 3, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN20 · Aguardando aprovação do sócio.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[2], NULL, NULL, '2026-11-01', '[{"id": 2000, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-12T10:00:00-03:00"}, {"id": 2001, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-15T10:00:00-03:00"}, {"id": 2002, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-10-18T10:00:00-03:00"}, {"id": 2008, "tipo": "followup", "descricao": "Follow-up agendado: Aguardando aprovação do sócio.", "created_at": "2026-10-10T15:00:00-03:00"}]'::jsonb, '2026-10-10 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Panificadora Pão Quente' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Panificadora Pão Quente', '(47) 3542-1814', '22.222.222/0001-22', 'Ituporanga', 3660.0, 0, '[{"servico": "Spot 15\" rotativo", "quantidade": 120, "precoUnitario": 18.0, "tempo": "15\"", "programa": "ROTATIVO"}, {"servico": "Vinheta de hora certa (mensal)", "quantidade": 1, "precoUnitario": 1500.0}]'::jsonb, 'aberto', 3, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN21 · Pediu 5% de desconto no pacote.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[3], NULL, NULL, '2026-11-02', '[{"id": 2100, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-16T10:00:00-03:00"}, {"id": 2101, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-19T10:00:00-03:00"}, {"id": 2102, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-10-22T10:00:00-03:00"}, {"id": 2108, "tipo": "followup", "descricao": "Follow-up agendado: Pediu 5% de desconto no pacote.", "created_at": "2026-10-14T15:00:00-03:00"}]'::jsonb, '2026-10-14 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Supermercado Bom Preço' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Supermercado Bom Preço', '(47) 3521-1037', '22.222.201/0001-01', 'Rio do Sul', 7200.0, 0, '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 120, "precoUnitario": 45.0, "tempo": "30\"", "programa": "MANHÃ"}, {"servico": "Testemunhal ao vivo", "quantidade": 20, "precoUnitario": 90.0, "tempo": "30\"", "programa": "MANHÃ"}]'::jsonb, 'aberto', 3, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN22 · Renovação + campanha de Natal.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], NULL, NULL, '2026-11-03', '[{"id": 2200, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-22T10:00:00-03:00"}, {"id": 2201, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-25T10:00:00-03:00"}, {"id": 2202, "tipo": "etapa", "descricao": "Movido para Negociação", "created_at": "2026-10-28T10:00:00-03:00"}, {"id": 2208, "tipo": "followup", "descricao": "Follow-up agendado: Renovação + campanha de Natal.", "created_at": "2026-10-20T15:00:00-03:00"}]'::jsonb, '2026-10-20 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Móveis Rainha' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Móveis Rainha', '(47) 3524-1148', '22.222.204/0001-04', 'Rio do Sul', 4700.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 150, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 2, "precoUnitario": 250.0}]'::jsonb, 'aberto', 2, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN23 · Proposta Natal enviada por e-mail.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], NULL, NULL, '2026-11-04', '[{"id": 2300, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-18T10:00:00-03:00"}, {"id": 2301, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-21T10:00:00-03:00"}, {"id": 2308, "tipo": "followup", "descricao": "Follow-up agendado: Proposta Natal enviada por e-mail.", "created_at": "2026-10-16T15:00:00-03:00"}]'::jsonb, '2026-10-16 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Imobiliária Horizonte' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Imobiliária Horizonte', '(47) 3527-1259', '22.222.207/0001-07', 'Rio do Sul', 4920.0, 0, '[{"servico": "Patrocínio de programa (mensal)", "quantidade": 1, "precoUnitario": 2400.0}, {"servico": "Spot 30\" rotativo", "quantidade": 90, "precoUnitario": 28.0, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, 'aberto', 2, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN24 · Renovação do loteamento — fase 2.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[2], NULL, NULL, '2026-10-30', '[{"id": 2400, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-23T10:00:00-03:00"}, {"id": 2401, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-26T10:00:00-03:00"}, {"id": 2408, "tipo": "followup", "descricao": "Follow-up agendado: Renovação do loteamento — fase 2.", "created_at": "2026-10-21T15:00:00-03:00"}]'::jsonb, '2026-10-21 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Agência Criativa Propaganda' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Agência Criativa Propaganda', '(47) 3541-1777', '22.222.221/0001-21', 'Rio do Sul', 5712.0, 0, '[{"servico": "Spot 30\" rotativo", "quantidade": 240, "precoUnitario": 23.8, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb, 'aberto', 2, 'Agência', 'demo_seed', 'boleto', '1', 'DEMO-RBN25 · Pacote para 2 clientes da agência.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[3], NULL, NULL, '2026-10-31', '[{"id": 2500, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-25T10:00:00-03:00"}, {"id": 2501, "tipo": "etapa", "descricao": "Movido para Proposta", "created_at": "2026-10-28T10:00:00-03:00"}, {"id": 2508, "tipo": "followup", "descricao": "Follow-up agendado: Pacote para 2 clientes da agência.", "created_at": "2026-10-23T15:00:00-03:00"}]'::jsonb, '2026-10-23 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Auto Center Vale' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Auto Center Vale', '(47) 3523-1111', '22.222.203/0001-03', 'Ibirama', 0, 0, '[]'::jsonb, 'aberto', 1, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN26 · Quer campanha de troca de óleo em dezembro.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[3], NULL, NULL, '2026-11-01', '[{"id": 2600, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-26T10:00:00-03:00"}, {"id": 2608, "tipo": "followup", "descricao": "Follow-up agendado: Quer campanha de troca de óleo em dezembro.", "created_at": "2026-10-24T15:00:00-03:00"}]'::jsonb, '2026-10-24 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Pizzaria Forno a Lenha' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Pizzaria Forno a Lenha', '(47) 3530-1370', '22.222.210/0001-10', 'Rio do Sul', 0, 0, '[]'::jsonb, 'aberto', 1, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN27 · Reabrir conversa — cardápio de verão.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], NULL, NULL, '2026-11-02', '[{"id": 2700, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-27T10:00:00-03:00"}, {"id": 2708, "tipo": "followup", "descricao": "Follow-up agendado: Reabrir conversa — cardápio de verão.", "created_at": "2026-10-25T15:00:00-03:00"}]'::jsonb, '2026-10-25 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Loja Moda Jovem' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Loja Moda Jovem', '(47) 3535-1555', '22.222.215/0001-15', 'Ituporanga', 0, 0, '[]'::jsonb, 'aberto', 1, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN28 · Coleção de verão, retomar em novembro.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[2], NULL, NULL, '2026-11-03', '[{"id": 2800, "tipo": "etapa", "descricao": "Movido para Contato Feito", "created_at": "2026-10-29T10:00:00-03:00"}, {"id": 2808, "tipo": "followup", "descricao": "Follow-up agendado: Coleção de verão, retomar em novembro.", "created_at": "2026-10-27T15:00:00-03:00"}]'::jsonb, '2026-10-27 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (1 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Clínica Odonto Sorriso' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Clínica Odonto Sorriso', '(47) 3525-1185', '22.222.205/0001-05', 'Ituporanga', 0, 0, '[]'::jsonb, 'aberto', 0, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN29 · Indicação do Dr. da Clínica — implantes.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (1 % array_length(v_unid, 1))], v_nomes[2], NULL, NULL, '2026-11-04', '[{"id": 2908, "tipo": "followup", "descricao": "Follow-up agendado: Indicação do Dr. da Clínica — implantes.", "created_at": "2026-10-27T15:00:00-03:00"}]'::jsonb, '2026-10-27 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (2 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Concessionária Vale Motors' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Concessionária Vale Motors', '(47) 3532-1444', '22.222.212/0001-12', 'Rio do Sul', 0, 0, '[]'::jsonb, 'aberto', 0, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN30 · Lançamento de modelo novo em novembro.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[3], NULL, NULL, '2026-10-30', '[{"id": 3008, "tipo": "followup", "descricao": "Follow-up agendado: Lançamento de modelo novo em novembro.", "created_at": "2026-10-28T15:00:00-03:00"}]'::jsonb, '2026-10-28 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  v_u := v_users[1 + (0 % array_length(v_users, 1))];
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND nome_empresa = 'Pet Shop Amigo Fiel' AND observacao_risco = 'DEMO-SEED' LIMIT 1;
  INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas, descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome, contrato_inicio, contrato_fim, followup_em, atividades, created_at, fechado_em)
    VALUES ('Pet Shop Amigo Fiel', '(47) 3537-1629', '22.222.217/0001-17', 'Rio do Sul', 0, 0, '[]'::jsonb, 'aberto', 0, 'Direto', 'demo_seed', 'boleto', '1', 'DEMO-RBN31 · Pediu tabela de preços pelo WhatsApp.', v_cli, v_emp, v_u, v_u, NULL, 0, v_unid[1 + (0 % array_length(v_unid, 1))], v_nomes[1], NULL, NULL, '2026-10-31', '[{"id": 3108, "tipo": "followup", "descricao": "Follow-up agendado: Pediu tabela de preços pelo WhatsApp.", "created_at": "2026-10-28T15:00:00-03:00"}]'::jsonb, '2026-10-28 09:30:00-03', NULL)
    RETURNING id INTO v_lead;

  -- Metas de faturamento da emissora (só se a RBN ainda não tinha metas)
  IF NOT EXISTS (SELECT 1 FROM metas WHERE empresa_id = v_emp) THEN
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 1, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 2, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 3, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 4, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 5, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 6, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 7, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 8, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 9, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 10, 14000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 11, 18000, 'faturamento', NULL, NULL);
    INSERT INTO metas (user_id, empresa_id, ano, mes, valor_objetivo, tipo, produto, unidade) VALUES (NULL, v_emp, 2026, 12, 18000, 'faturamento', NULL, NULL);
  END IF;
END $demo$;
