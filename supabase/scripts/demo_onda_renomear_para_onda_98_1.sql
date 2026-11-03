-- Conta de demonstração (antiga RBN, hoje "ONDA DEMO", id 80fc2113-...): troca tudo de "RBN" para
-- a emissora "Onda 98.1". Rodado em 03/11/2026. Não mexe no e-mail de login nem no faturamento
-- da WeGrow (clientes_wegrow). Pode rodar de novo sem problema.
DO $onda$
DECLARE
  v_emp constant uuid := '80fc2113-3112-4471-87c0-08770dd2ccb1';
  v_nome constant text := 'Onda 98.1';
BEGIN
  -- Emissora cadastrada em Unidades (lista de emissoras, filtros, OPEC)
  IF NOT EXISTS (SELECT 1 FROM unidades WHERE empresa_id = v_emp AND nome = v_nome) THEN
    INSERT INTO unidades (empresa_id, nome, razao_social, cnpj, cidade, estado, config_opec)
    VALUES (v_emp, v_nome, 'Rádio Onda FM Ltda (fictícia)', '33.333.333/0001-33', 'Rio do Sul', 'SC',
            jsonb_build_object('mercado_id', '1', 'mercado_codigo', 'ON-981', 'mercado_cnpj', '33.333.333/0001-33', 'mercado_descricao', 'ONDA 98.1 RIO DO SUL'));
  END IF;

  -- Nome da emissora em vendas, produção, visitas, audiência e rotas
  UPDATE leads    SET unidade = v_nome WHERE empresa_id = v_emp AND unidade ILIKE 'RBN%';
  UPDATE jobs     SET unidade = v_nome WHERE empresa_id = v_emp AND unidade ILIKE 'RBN%';
  UPDATE visitas  SET unidade = v_nome WHERE empresa_id = v_emp AND unidade ILIKE 'RBN%';
  UPDATE audiencia_pesquisas SET unidade = v_nome WHERE empresa_id = v_emp AND unidade ILIKE 'RBN%';
  UPDATE rotas_dia SET unidade = v_nome WHERE empresa_id = v_emp AND unidade ILIKE 'RBN%';

  -- Produto "Post patrocinado Instagram RBN" e onde ele aparece (itens das vendas, produção)
  UPDATE servicos SET nome = replace(nome, 'RBN', 'Onda') WHERE empresa_id = v_emp AND nome ILIKE '%RBN%';
  UPDATE leads SET itens = replace(replace(itens::text, 'RBN 94,3', v_nome), 'RBN', 'Onda')::jsonb
   WHERE empresa_id = v_emp AND itens::text ILIKE '%RBN%';
  UPDATE jobs SET itens_opec = replace(replace(itens_opec::text, 'RBN 94,3', v_nome), 'RBN', 'Onda')::jsonb
   WHERE empresa_id = v_emp AND itens_opec::text ILIKE '%RBN%';
  UPDATE jobs SET briefing = replace(replace(briefing, 'RBN 94,3', v_nome), 'RBN', 'Onda')
   WHERE empresa_id = v_emp AND briefing ILIKE '%RBN%';

  -- Descrição das vendas: tira o marcador interno "DEMO-RBN-D107 · " que aparecia na tela
  UPDATE leads SET descricao = regexp_replace(descricao, '^DEMO-RBN-?[A-Za-z0-9]*\s*·\s*', '')
   WHERE empresa_id = v_emp AND descricao LIKE 'DEMO-RBN%';

  RAISE NOTICE 'Conta de demonstração agora usa a emissora %.', v_nome;
END $onda$;

-- Conferência: deve sobrar "RBN" só no e-mail de login e no faturamento interno
SELECT 'leads' AS onde, count(*) FILTER (WHERE unidade ILIKE '%rbn%' OR descricao ILIKE '%rbn%' OR itens::text ILIKE '%rbn%') AS ainda_rbn, count(*) FILTER (WHERE unidade = 'Onda 98.1') AS onda FROM leads WHERE empresa_id = '80fc2113-3112-4471-87c0-08770dd2ccb1'
UNION ALL SELECT 'jobs', count(*) FILTER (WHERE unidade ILIKE '%rbn%' OR briefing ILIKE '%rbn%' OR itens_opec::text ILIKE '%rbn%'), count(*) FILTER (WHERE unidade = 'Onda 98.1') FROM jobs WHERE empresa_id = '80fc2113-3112-4471-87c0-08770dd2ccb1'
UNION ALL SELECT 'visitas', count(*) FILTER (WHERE unidade ILIKE '%rbn%'), count(*) FILTER (WHERE unidade = 'Onda 98.1') FROM visitas WHERE empresa_id = '80fc2113-3112-4471-87c0-08770dd2ccb1'
UNION ALL SELECT 'unidades', 0, count(*) FROM unidades WHERE empresa_id = '80fc2113-3112-4471-87c0-08770dd2ccb1';
