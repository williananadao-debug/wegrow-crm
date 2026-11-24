-- DEMO SINTONIA (24/11/2026): movimento FICTÍCIO em cima dos CLIENTES REAIS importados do Sysrad.
-- Carga de dados, não de schema. Cria catálogo, metas 2026, negócios (abertos, ganhos e perdidos),
-- produções, parcelas, visitas e tarefas de 01/06/2026 até hoje (+30 dias de agenda).
-- Os clientes NÃO são alterados. Tudo que este script cria é marcado e sai com
-- 20261124130100_DEMO_sintonia_limpar_movimento.sql:
--   leads.pedido_detalhes->>'demo' = 'true' · jobs.briefing com 'DEMO-SEED' · lancamentos.nf_numero = 'DEMO'
--   servicos.descricao 'DEMO-SEED…' · visitas.observacao e tarefas.titulo terminam com chr(8203) (invisível)
--   metas 2026 da empresa (a conta não tinha metas)
-- Vendedores (Carla, Rafael, Juliana) são só nomes; o dono de tudo é o usuário diretor da conta.

DO $demo$
DECLARE
  v_emp uuid := '13f70c3e-54e6-4568-86ea-2141a17f7209';
  M text := chr(8203);  -- marca invisível de dado demo em visitas/tarefas
  v_user uuid;
  v_unid text := 'Sintonia FM';
  v_nomes text[] := ARRAY['Carla Mendes', 'Rafael Souza', 'Juliana Prates'];
  v_pacotes jsonb[] := ARRAY[
    '[{"servico": "Inserção 30\"", "quantidade": 60, "precoUnitario": 35, "tempo": "30\"", "programa": "ROTATIVO"}]'::jsonb,
    '[{"servico": "Inserção 60\"", "quantidade": 40, "precoUnitario": 55, "tempo": "60\"", "programa": "ROTATIVO"}]'::jsonb,
    '[{"servico": "Boletim Informativo - 1 minuto", "quantidade": 20, "precoUnitario": 80, "tempo": "60\"", "programa": "MANHÃ"}]'::jsonb,
    '[{"servico": "Testemunhal ao vivo", "quantidade": 12, "precoUnitario": 90, "tempo": "60\"", "programa": "MANHÃ"}, {"servico": "Mídia Social - Post Story", "quantidade": 4, "precoUnitario": 65}]'::jsonb,
    '[{"servico": "Patrocínio Jornal da Amavi (mensal)", "quantidade": 1, "precoUnitario": 1200}]'::jsonb,
    '[{"servico": "Inserção 30\"", "quantidade": 90, "precoUnitario": 35, "tempo": "30\"", "programa": "ROTATIVO"}, {"servico": "Mídia Social - Post Feed", "quantidade": 2, "precoUnitario": 120}]'::jsonb,
    '[{"servico": "Citação de Abertura", "quantidade": 30, "precoUnitario": 40, "tempo": "15\"", "programa": "MANHÃ"}]'::jsonb,
    '[{"servico": "Entrevista Estúdio", "quantidade": 1, "precoUnitario": 300}, {"servico": "Mídia Social - Post Reels Produzido", "quantidade": 1, "precoUnitario": 250}]'::jsonb,
    '[{"servico": "Podcast Cota Apoio - Papo em Sintonia", "quantidade": 1, "precoUnitario": 800}]'::jsonb,
    '[{"servico": "Inserção 60\"", "quantidade": 120, "precoUnitario": 55, "tempo": "60\"", "programa": "ROTATIVO"}, {"servico": "Mídia Social - Banner Site (mensal)", "quantidade": 3, "precoUnitario": 300}]'::jsonb,
    '[{"servico": "Nota de Falecimento", "quantidade": 3, "precoUnitario": 40}, {"servico": "Missa Sétimo Dia", "quantidade": 2, "precoUnitario": 60}]'::jsonb,
    '[{"servico": "Flash", "quantidade": 20, "precoUnitario": 45, "programa": "TARDE"}]'::jsonb
  ];
  v_desc text[] := ARRAY['Campanha do mês', 'Promoção de fim de semana', 'Inauguração da loja', 'Campanha de aniversário da empresa',
                         'Feirão de ofertas', 'Campanha institucional', 'Divulgação de evento', 'Black Friday', 'Campanha de Natal', 'Liquidação de estação'];
  v_origens text[] := ARRAY['Visita', 'Visita', 'Indicação', 'Renovação', 'WhatsApp', 'Prospecção ativa', 'Instagram', 'Visita'];
  v_motivos text[] := ARRAY['Achou o preço alto para o momento, pediu proposta menor', 'Fechou com outra rádio da região',
                            'Sem retorno depois de 3 contatos', 'Vai investir só no começo do ano', 'Orçamento já comprometido com Instagram',
                            'Decisão ficou com o sócio, que preferiu não anunciar agora'];
  v_obs text[] := ARRAY['Apresentei o mídia kit e a audiência da manhã.', 'Visita de relacionamento: campanha no ar, cliente satisfeito.',
                        'Entreguei o comprovante de inserções do mês.', 'Levei proposta impressa; responde até sexta.',
                        'Primeiro contato, deixei material e cartão. Retornar em 15 dias.', 'Conversa sobre campanha de fim de ano.',
                        'Cliente pediu orçamento de patrocínio do jornal.'];
  v_tar text[] := ARRAY['Ligar para % (retorno da proposta)', 'Visitar % (renovação do contrato)', 'Follow-up no WhatsApp com %',
                        'Mandar comprovante de veiculação para %', 'Levar mídia kit atualizado para %'];
  d date; i int := 0; k int; n int; v_cli record; v_itens jsonb; v_valor numeric; v_lead bigint; v_status text; v_etapa int;
  v_parc int; v_dias int; v_vend int; v_mes int; v_media numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = v_emp) THEN RAISE EXCEPTION 'SINTONIA não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM leads WHERE empresa_id = v_emp AND pedido_detalhes->>'demo' = 'true') THEN
    RAISE EXCEPTION 'Movimento demo já carregado: rode a limpeza antes de recarregar.';
  END IF;
  SELECT id INTO v_user FROM profiles WHERE empresa_id = v_emp ORDER BY (cargo = 'diretor') DESC, id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'SINTONIA sem usuário.'; END IF;
  IF (SELECT count(*) FROM clientes WHERE empresa_id = v_emp AND deleted_at IS NULL) < 50 THEN RAISE EXCEPTION 'Importe os clientes antes.'; END IF;

  -- ── Catálogo (serviços da Sintonia vistos no beComm) ─────────────────────────────
  INSERT INTO servicos (nome, preco, tipo, unidade, descricao, empresa_id)
  SELECT s.nome, s.preco, 'Mídia', s.un, 'DEMO-SEED — catálogo de demonstração', v_emp
    FROM (VALUES ('Inserção 30"', 35, 'Inserção'), ('Inserção 60"', 55, 'Inserção'), ('Boletim Informativo - 1 minuto', 80, 'Inserção'),
                 ('Boletim Informativo - 6 min', 250, 'Inserção'), ('Citação de Abertura', 40, 'Inserção'), ('Flash', 45, 'Inserção'),
                 ('Testemunhal ao vivo', 90, 'Inserção'), ('Entrevista Estúdio', 300, 'Ação'), ('Patrocínio Jornal da Amavi (mensal)', 1200, 'Mês'),
                 ('Podcast Cota Apoio - Papo em Sintonia', 800, 'Mês'), ('Mídia Social - Post Feed', 120, 'Post'), ('Mídia Social - Post Story', 65, 'Post'),
                 ('Mídia Social - Post Reels Produzido', 250, 'Post'), ('Mídia Social - Banner Site (mensal)', 300, 'Mês'),
                 ('Nota de Falecimento', 40, 'Inserção'), ('Missa Sétimo Dia', 60, 'Inserção'), ('Avulso Festa', 150, 'Ação')) s(nome, preco, un)
   WHERE NOT EXISTS (SELECT 1 FROM servicos x WHERE x.empresa_id = v_emp AND x.nome = s.nome);

  -- ── Negócios dia a dia (01/06 até hoje) ──────────────────────────────────────────
  FOR d IN SELECT generate_series(DATE '2026-06-01', CURRENT_DATE, interval '1 day')::date LOOP
    -- dia útil: 2 a 3 negócios; fim de semana: 0 a 1
    n := CASE WHEN extract(isodow FROM d) >= 6 THEN (abs(hashtext(d::text)) % 2) ELSE 2 + (abs(hashtext(d::text)) % 2) END;
    FOR k IN 1 .. n LOOP
      i := i + 1;
      SELECT id, nome_empresa, cidade, telefone, cnpj INTO v_cli FROM clientes
        WHERE empresa_id = v_emp AND deleted_at IS NULL ORDER BY md5(d::text || k::text || id::text) LIMIT 1;
      v_itens := v_pacotes[1 + (abs(hashtext(v_cli.id::text || d::text)) % array_length(v_pacotes, 1))];
      SELECT sum((x->>'quantidade')::numeric * (x->>'precoUnitario')::numeric) INTO v_valor FROM jsonb_array_elements(v_itens) x;
      v_vend := 1 + (i % 3);
      v_dias := CURRENT_DATE - d;
      -- recentes ficam no funil; antigos: ~75% ganho, ~25% perdido
      IF v_dias <= 20 AND (i % 4) = 0 THEN
        v_status := 'aberto'; v_etapa := (i % 4);
      ELSIF (abs(hashtext(i::text)) % CASE WHEN v_dias <= 25 THEN 9 ELSE 4 END) = 0 THEN  -- mês corrente perde menos
        v_status := 'perdido'; v_etapa := 5;
      ELSE
        v_status := 'ganho'; v_etapa := 4;
      END IF;
      v_parc := CASE WHEN v_valor >= 2500 THEN 3 WHEN v_valor >= 1200 THEN 2 ELSE 1 END;

      INSERT INTO leads (empresa, telefone, cnpj, cidade, valor_total, desconto, itens, status, etapa, tipo, origem, forma_pagamento, parcelas,
                         descricao, client_id, empresa_id, user_id, criado_por, fechado_por, ordem, unidade, vendedor_nome,
                         contrato_inicio, contrato_fim, notas, atividades, pedido_detalhes, created_at, fechado_em)
      VALUES (v_cli.nome_empresa, v_cli.telefone, v_cli.cnpj, v_cli.cidade, v_valor, 0, v_itens, v_status, v_etapa, 'Direto',
              v_origens[1 + (i % array_length(v_origens, 1))], CASE WHEN i % 3 = 0 THEN 'pix' ELSE 'boleto' END, v_parc::text,
              v_desc[1 + (i % array_length(v_desc, 1))] || '.', v_cli.id, v_emp, v_user, v_user, CASE WHEN v_status = 'ganho' THEN v_user END, 0,
              v_unid, v_nomes[v_vend], d + 2, d + 2 + 30 * v_parc - 1,
              CASE WHEN v_status = 'perdido' THEN jsonb_build_array(jsonb_build_object('id', 700000 + i,
                'texto', '🔴 MOTIVO DA PERDA: ' || v_motivos[1 + (i % array_length(v_motivos, 1))], 'created_at', to_char(d, 'YYYY-MM-DD') || 'T16:00:00-03:00'))
                ELSE '[]'::jsonb END,
              jsonb_build_array(jsonb_build_object('id', 800000 + i, 'tipo', 'etapa',
                'descricao', CASE v_status WHEN 'ganho' THEN 'Movido para Ganhos' WHEN 'perdido' THEN 'Movido para Perdidos' ELSE 'Lead criado' END,
                'created_at', to_char(d, 'YYYY-MM-DD') || 'T15:00:00-03:00')),
              jsonb_build_object('demo', true, 'campanha', v_desc[1 + (i % array_length(v_desc, 1))]),
              ((d - (2 + i % 6))::timestamp + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
              CASE WHEN v_status IN ('ganho', 'perdido') THEN (d::timestamp + time '15:00') AT TIME ZONE 'America/Sao_Paulo' END)
      RETURNING id INTO v_lead;

      IF v_status = 'ganho' THEN
        INSERT INTO jobs (titulo, briefing, client_id, user_id, empresa_id, stage, prioridade, deadline, cliente, data_inicio, data_fim, itens_opec, vendedor_nome, unidade, created_at)
        VALUES ('Gravação: ' || v_cli.nome_empresa,
                'VENDA APROVADA (Ref: LD-' || lpad(v_lead::text, 4, '0') || ')' || chr(10) || chr(10) || 'Valor Final: R$ ' || v_valor || chr(10) || chr(10) || 'DEMO-SEED',
                v_cli.id, v_user, v_emp,
                CASE WHEN v_dias > 30 THEN 'entregue' WHEN v_dias > 10 THEN 'aprovacao' WHEN v_dias > 6 THEN 'edicao' WHEN v_dias > 3 THEN 'gravacao' ELSE 'roteiro' END,
                CASE WHEN v_dias <= 6 THEN 'alta' ELSE 'media' END,
                ((d + 2)::timestamp + time '18:00') AT TIME ZONE 'America/Sao_Paulo', v_cli.nome_empresa, d + 2, d + 2 + 30 * v_parc - 1, v_itens,
                v_nomes[v_vend], v_unid, (d::timestamp + time '15:30') AT TIME ZONE 'America/Sao_Paulo');
        FOR k IN 1 .. v_parc LOOP
          INSERT INTO lancamentos (titulo, valor, tipo, categoria, status, data_vencimento, data_pagamento, recorrente, nf_numero, user_id, empresa_id)
          VALUES ('VENDA: ' || v_cli.nome_empresa || ' — parcela ' || k || '/' || v_parc, round(v_valor / v_parc, 2), 'entrada', 'vendas',
                  CASE WHEN d + 10 + 30 * (k - 1) <= CURRENT_DATE THEN 'pago' ELSE 'pendente' END, d + 10 + 30 * (k - 1),
                  CASE WHEN d + 10 + 30 * (k - 1) <= CURRENT_DATE THEN d + 10 + 30 * (k - 1) END, false, 'DEMO', v_user, v_emp);
        END LOOP;
      END IF;
    END LOOP;

    -- visitas: 3 por dia útil, 0 no fim de semana
    IF extract(isodow FROM d) < 6 THEN
      FOR k IN 1 .. 3 LOOP
        SELECT id, nome_empresa, cidade, telefone INTO v_cli FROM clientes
          WHERE empresa_id = v_emp AND deleted_at IS NULL ORDER BY md5('v' || d::text || k::text || id::text) LIMIT 1;
        INSERT INTO visitas (empresa, telefone, observacao, user_id, empresa_id, unidade, cliente_id, cidade, created_at)
        VALUES (v_cli.nome_empresa, v_cli.telefone, v_obs[1 + ((i + k) % array_length(v_obs, 1))] || M, v_user, v_emp, v_unid, v_cli.id, v_cli.cidade,
                (d::timestamp + make_interval(hours => 8 + k * 2, mins => (abs(hashtext(v_cli.id::text)) % 50))) AT TIME ZONE 'America/Sao_Paulo');
      END LOOP;
    END IF;
  END LOOP;

  -- ── Tarefas: 2 por dia de 01/06 até hoje + 30 ────────────────────────────────────
  i := 0;
  FOR d IN SELECT generate_series(DATE '2026-06-01', CURRENT_DATE + 30, interval '1 day')::date LOOP
    FOR k IN 1 .. 2 LOOP
      i := i + 1;
      SELECT nome_empresa INTO v_cli FROM clientes WHERE empresa_id = v_emp AND deleted_at IS NULL ORDER BY md5('t' || d::text || k::text || id::text) LIMIT 1;
      INSERT INTO tarefas (titulo, data, concluido, user_id, empresa_id, created_at)
      VALUES (replace(v_tar[1 + (i % array_length(v_tar, 1))], '%', v_cli.nome_empresa) || M, d, d < CURRENT_DATE, v_user, v_emp,
              (d - 3)::timestamp AT TIME ZONE 'America/Sao_Paulo');
    END LOOP;
  END LOOP;

  -- ── Metas 2026: média vendida por mês + 10% (global, sem vendedor) ───────────────
  IF NOT EXISTS (SELECT 1 FROM metas WHERE empresa_id = v_emp AND ano = 2026) THEN
    SELECT round(avg(t) * 1.1, -2) INTO v_media FROM (
      SELECT sum(valor_total) t FROM leads WHERE empresa_id = v_emp AND status = 'ganho' AND pedido_detalhes->>'demo' = 'true'
       GROUP BY date_trunc('month', fechado_em)) s;
    FOR v_mes IN 1 .. 12 LOOP
      INSERT INTO metas (user_id, ano, mes, valor_objetivo, tipo, empresa_id) VALUES (NULL, 2026, v_mes, coalesce(v_media, 30000), 'faturamento', v_emp);
    END LOOP;
    INSERT INTO metas (user_id, ano, mes, valor_objetivo, tipo, empresa_id) VALUES (NULL, 2026, NULL, coalesce(v_media, 30000) * 12, 'faturamento', v_emp);
  END IF;

  -- ── Alertas de hoje (mesma ideia da demo ONDA) ───────────────────────────────────
  WITH abertos AS (SELECT id, row_number() OVER (ORDER BY created_at DESC) rn FROM leads
                    WHERE empresa_id = v_emp AND pedido_detalhes->>'demo' = 'true' AND status = 'aberto')
  UPDATE leads l SET followup_em = CASE WHEN a.rn <= 3 THEN CURRENT_DATE WHEN a.rn <= 7 THEN CURRENT_DATE - (a.rn::int - 2)
                                        ELSE CURRENT_DATE + (1 + (a.rn::int % 10)) END
    FROM abertos a WHERE l.id = a.id;
  WITH recentes AS (SELECT id, row_number() OVER (ORDER BY fechado_em DESC) rn FROM leads
                     WHERE empresa_id = v_emp AND pedido_detalhes->>'demo' = 'true' AND status = 'ganho')
  UPDATE leads l SET contrato_fim = CURRENT_DATE + (ARRAY[3, 7, 12, 18, 24, 29])[r.rn::int] FROM recentes r WHERE l.id = r.id AND r.rn <= 6;
  WITH andamento AS (SELECT id, row_number() OVER (ORDER BY created_at DESC) rn FROM jobs
                      WHERE empresa_id = v_emp AND briefing LIKE '%DEMO-SEED%' AND stage IN ('roteiro', 'gravacao', 'edicao'))
  UPDATE jobs j SET deadline = ((CURRENT_DATE - a.rn::int)::timestamp + time '18:00') AT TIME ZONE 'America/Sao_Paulo', prioridade = 'alta'
    FROM andamento a WHERE j.id = a.id AND a.rn <= 2;
  WITH parcelas AS (SELECT id, row_number() OVER (ORDER BY data_vencimento DESC) rn FROM lancamentos
                     WHERE empresa_id = v_emp AND nf_numero = 'DEMO' AND data_vencimento BETWEEN CURRENT_DATE - 20 AND CURRENT_DATE - 3)
  UPDATE lancamentos lc SET status = 'pendente', data_pagamento = NULL FROM parcelas p WHERE lc.id = p.id AND p.rn <= 3;

  RAISE NOTICE 'Demo Sintonia: % negócios, % visitas, % tarefas.',
    (SELECT count(*) FROM leads WHERE empresa_id = v_emp AND pedido_detalhes->>'demo' = 'true'),
    (SELECT count(*) FROM visitas WHERE empresa_id = v_emp AND observacao LIKE '%' || M),
    (SELECT count(*) FROM tarefas WHERE empresa_id = v_emp AND titulo LIKE '%' || M);
END $demo$;
