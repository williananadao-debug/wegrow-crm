-- ATUALIZA A DEMO DA RBN 94,3 — rode na véspera de cada apresentação (pode rodar quantas vezes quiser).
-- Usa a data do dia (CURRENT_DATE), então o painel sempre tem "hoje" cheio e alertas atuais:
--   1. Todo dia de 01/06/2026 até hoje (fim de semana incluso) ganha pelo menos 1 venda fechada,
--      1 visita e 1 tarefa — só preenche o dia que estiver vazio, não duplica.
--   2. Agenda dos próximos 30 dias preenchida (tarefas em aberto).
--   3. Alertas: follow-ups para hoje e atrasados, contratos vencendo nos próximos 30 dias,
--      produções com prazo estourado e parcelas vencidas em aberto.
-- Só mexe em dados demo (origem 'demo_seed' / anunciantes DEMO-SEED) e sai no script de limpeza 20261029110100.
-- Pressupõe a carga principal (20261029110000) já rodada.

DO $demo$
DECLARE
  v_emp uuid;
  v_count int;
  v_users uuid[];
  v_unid text[];
  v_nomes text[] := ARRAY['Carla Mendes', 'Rafael Souza', 'Juliana Prates'];
  v_pacotes jsonb[] := ARRAY[
    '[{"servico": "Spot 30\" rotativo", "quantidade": 30, "precoUnitario": 28, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb,
    '[{"servico": "Spot 15\" rotativo", "quantidade": 60, "precoUnitario": 18, "tempo": "15\"", "programa": "ROTATIVO"}]'::jsonb,
    '[{"servico": "Testemunhal ao vivo", "quantidade": 8, "precoUnitario": 90, "tempo": "30\"", "programa": "MANHÃ"}]'::jsonb,
    '[{"servico": "Spot 30\" horário nobre (6h-9h)", "quantidade": 30, "precoUnitario": 45, "tempo": "30\"", "programa": "MANHÃ"}]'::jsonb,
    '[{"servico": "Spot 30\" rotativo", "quantidade": 45, "precoUnitario": 28, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Produção de spot (gravação + edição)", "quantidade": 1, "precoUnitario": 250}]'::jsonb,
    '[{"servico": "Post patrocinado Instagram RBN", "quantidade": 2, "precoUnitario": 350}, {"servico": "Spot 15\" rotativo", "quantidade": 30, "precoUnitario": 18, "tempo": "15\"", "programa": "ROTATIVO"}]'::jsonb
  ];
  v_obs text[] := ARRAY['Apresentei o mídia kit e a audiência da manhã.', 'Visita de relacionamento — campanha no ar.', 'Entreguei o comprovante de inserções.', 'Levei proposta impressa; responde até sexta.', 'Conversa sobre campanha de fim de ano.'];
  v_tar text[] := ARRAY['Ligar para % — retorno da proposta', 'Visitar % — renovação do contrato', 'Follow-up WhatsApp com %', 'Mandar comprovante de veiculação para %', 'Levar mídia kit atualizado para %'];
  d date;
  i int := 0;
  v_u uuid;
  v_vi int;
  v_ui int;
  v_cli record;
  v_itens jsonb;
  v_valor numeric;
  v_lead bigint;
  v_dias int;
BEGIN
  SELECT count(*) INTO v_count FROM empresas WHERE nome ILIKE '%rbn%';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Esperava 1 empresa com "RBN" no nome, achou %. Ajuste o filtro.', v_count; END IF;
  SELECT id INTO v_emp FROM empresas WHERE nome ILIKE '%rbn%';
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED') THEN RAISE EXCEPTION 'Rode antes a carga principal (20261029110000).'; END IF;
  v_users := ARRAY(SELECT id FROM profiles WHERE empresa_id = v_emp ORDER BY (cargo = 'diretor') DESC, id);
  v_unid := ARRAY(SELECT nome FROM unidades WHERE empresa_id = v_emp ORDER BY nome);
  IF array_length(v_unid, 1) IS NULL THEN v_unid := ARRAY['RBN 94,3']; END IF;

  -- ── 1. Todo dia até hoje: venda fechada, visita e tarefa ─────────────────────────
  FOR d IN SELECT generate_series(DATE '2026-06-01', CURRENT_DATE, interval '1 day')::date LOOP
    i := i + 1;
    v_vi := i % 3; v_ui := i % 2;
    v_u := v_users[1 + (v_vi % array_length(v_users, 1))];
    SELECT id, nome_empresa, cidade, telefone, cnpj INTO v_cli FROM clientes
      WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED' ORDER BY md5(d::text || id::text) LIMIT 1;

    IF NOT EXISTS (SELECT 1 FROM leads WHERE empresa_id = v_emp AND status = 'ganho'
                   AND (fechado_em AT TIME ZONE 'America/Sao_Paulo')::date = d) THEN
      v_itens := v_pacotes[1 + (i % array_length(v_pacotes, 1))];
      SELECT sum((x->>'quantidade')::numeric * (x->>'precoUnitario')::numeric) INTO v_valor FROM jsonb_array_elements(v_itens) x;
      -- fim de semana vende menos: metade do pacote
      IF extract(isodow FROM d) >= 6 THEN
        v_itens := (SELECT jsonb_agg(jsonb_set(x, '{quantidade}', to_jsonb(GREATEST(1, (x->>'quantidade')::int / 2)))) FROM jsonb_array_elements(v_itens) x);
        SELECT sum((x->>'quantidade')::numeric * (x->>'precoUnitario')::numeric) INTO v_valor FROM jsonb_array_elements(v_itens) x;
      END IF;
      INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas,
                         descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome,
                         contrato_inicio, contrato_fim, atividades, created_at, fechado_em)
      VALUES (v_cli.nome_empresa, v_cli.telefone, v_cli.cnpj, v_cli.cidade, v_valor, 0, v_itens, 'ganho', 4, 'Direto', 'demo_seed', 'boleto', '1',
              'DEMO-RBN-F · Campanha do mês.', v_cli.id, v_emp, v_u, v_u, v_u, 0, v_unid[1 + (v_ui % array_length(v_unid, 1))], v_nomes[v_vi + 1],
              d + 2, d + 31,
              jsonb_build_array(jsonb_build_object('id', 90000 + i, 'tipo', 'etapa', 'descricao', 'Movido para Ganhos', 'created_at', to_char(d, 'YYYY-MM-DD') || 'T15:00:00-03:00')),
              ((d - 3)::timestamp + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
              (d::timestamp + time '15:00') AT TIME ZONE 'America/Sao_Paulo')
      RETURNING id INTO v_lead;
      v_dias := CURRENT_DATE - d;
      INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
      VALUES ('Gravação: ' || v_cli.nome_empresa,
              'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || chr(10) || chr(10) || 'Valor Final: R$ ' || v_valor || chr(10) || chr(10) || 'DEMO-SEED',
              v_cli.id, v_u, v_emp,
              CASE WHEN v_dias > 30 THEN 'entregue' WHEN v_dias > 10 THEN 'aprovacao' WHEN v_dias > 6 THEN 'edicao' WHEN v_dias > 3 THEN 'gravacao' ELSE 'roteiro' END,
              CASE WHEN v_dias <= 6 THEN 'alta' ELSE 'media' END,
              ((d + 2)::timestamp + time '18:00') AT TIME ZONE 'America/Sao_Paulo', v_cli.nome_empresa, d + 2, d + 31, v_itens,
              v_nomes[v_vi + 1], v_unid[1 + (v_ui % array_length(v_unid, 1))], (d::timestamp + time '15:30') AT TIME ZONE 'America/Sao_Paulo');
      INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id)
      VALUES ('VENDA: ' || v_cli.nome_empresa || ' — parcela 1/1', v_valor, 'entrada', 'vendas',
              CASE WHEN d + 2 <= CURRENT_DATE THEN 'pago' ELSE 'pendente' END, d + 2,
              CASE WHEN d + 2 <= CURRENT_DATE THEN d + 2 END, false, 'DEMO', v_u, v_emp);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM visitas WHERE empresa_id = v_emp AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = d) THEN
      INSERT INTO visitas (empresa, telefone, observacao, user_id, empresa_id, unidade, cliente_id, cidade, created_at)
      VALUES (v_cli.nome_empresa, v_cli.telefone, v_obs[1 + (i % array_length(v_obs, 1))], v_u, v_emp,
              v_unid[1 + (v_ui % array_length(v_unid, 1))], v_cli.id, v_cli.cidade, (d::timestamp + time '10:30') AT TIME ZONE 'America/Sao_Paulo');
    END IF;
  END LOOP;

  -- ── 2. Tarefas: todo dia de 01/06 até hoje + 30 dias ─────────────────────────────
  i := 0;
  FOR d IN SELECT generate_series(DATE '2026-06-01', CURRENT_DATE + 30, interval '1 day')::date LOOP
    i := i + 1;
    IF NOT EXISTS (SELECT 1 FROM tarefas WHERE empresa_id = v_emp AND data = d) THEN
      SELECT nome_empresa INTO v_cli FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED' ORDER BY md5('t' || d::text || id::text) LIMIT 1;
      FOR v_vi IN 0 .. LEAST(2, array_length(v_users, 1) - 1) LOOP
        INSERT INTO tarefas (titulo, data, concluido, user_id, empresa_id, created_at)
        VALUES (replace(v_tar[1 + ((i + v_vi) % array_length(v_tar, 1))], '%', v_cli.nome_empresa), d, d < CURRENT_DATE,
                v_users[1 + v_vi], v_emp, (d - 3)::timestamp AT TIME ZONE 'America/Sao_Paulo');
      END LOOP;
    END IF;
  END LOOP;

  -- ── 3. Alertas, sempre relativos a hoje ──────────────────────────────────────────
  -- Limpa follow-ups demo e redistribui: 3 para hoje, 4 atrasados, o resto nos próximos dias.
  WITH abertos AS (
    SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
    FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed' AND status = 'aberto'
  )
  UPDATE leads l SET followup_em = CASE
      WHEN a.rn <= 3 THEN CURRENT_DATE
      WHEN a.rn <= 7 THEN CURRENT_DATE - (a.rn::int - 2)
      ELSE CURRENT_DATE + (1 + (a.rn::int % 10)) END
  FROM abertos a WHERE l.id = a.id;

  -- Contratos vencendo: 6 vendas recentes com fim em 3, 7, 12, 18, 24 e 29 dias.
  WITH recentes AS (
    SELECT id, row_number() OVER (ORDER BY fechado_em DESC) AS rn
    FROM leads WHERE empresa_id = v_emp AND origem = 'demo_seed' AND status = 'ganho' AND contrato_inicio IS NOT NULL
  )
  UPDATE leads l SET contrato_fim = CURRENT_DATE + (ARRAY[3, 7, 12, 18, 24, 29])[r.rn::int]
  FROM recentes r WHERE l.id = r.id AND r.rn <= 6;

  -- Produção atrasada: 2 jobs em andamento com prazo estourado.
  WITH andamento AS (
    SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
    FROM jobs WHERE empresa_id = v_emp AND briefing LIKE '%DEMO-SEED%' AND stage IN ('roteiro', 'gravacao', 'edicao')
  )
  UPDATE jobs j SET deadline = ((CURRENT_DATE - a.rn::int)::timestamp + time '18:00') AT TIME ZONE 'America/Sao_Paulo', prioridade = 'alta'
  FROM andamento a WHERE j.id = a.id AND a.rn <= 2;

  -- Inadimplência: 3 parcelas vencidas em aberto.
  WITH parcelas AS (
    SELECT id, row_number() OVER (ORDER BY data_vencimento DESC) AS rn
    FROM lancamentos WHERE empresa_id = v_emp AND nf_numero = 'DEMO' AND data_vencimento BETWEEN CURRENT_DATE - 20 AND CURRENT_DATE - 3
  )
  UPDATE lancamentos lc SET status = 'pendente', data_pagamento = NULL
  FROM parcelas p WHERE lc.id = p.id AND p.rn <= 3;
END $demo$;
