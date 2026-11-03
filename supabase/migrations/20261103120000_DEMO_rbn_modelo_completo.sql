-- DEMO DA RBN 94,3 — COMPLEMENTO "MODELO COMPLETO" (03/11/2026)
-- Carga de DADOS, não de schema. Rode no SQL Editor DEPOIS da carga principal (20261029110000) e,
-- se quiser, do dia a dia (20261029140000). Pode rodar quantas vezes quiser: não duplica nada.
--
-- Deixa a demo pronta para as telas novas:
--   1. Segmento dos anunciantes no padrão do CRM (relatório por segmento, potencial no "Ao redor")
--   2. Endereço completo dos anunciantes (ficha do cliente, Rota do Dia)
--   3. Origem variada nas vendas (relatório "Origem dos leads")
--   4. Motivo registrado em toda venda perdida (relatório "Motivos de perda")
--   5. Faixa horária nos itens das propostas (relatório por programa e audiência do plano)
--   6. Pesquisa de audiência da rádio por faixa horária (tela Audiência + proposta)
--   7. Rota do Dia de hoje com 6 paradas (Visitas → Rota do Dia)
--
-- Tudo continua saindo no script de limpeza 20261029110100 (atualizado para pegar os dados novos).
-- Os vendedores, empresas, CNPJs e números de audiência são inventados.

DO $demo$
DECLARE
  v_emp uuid;
  v_count int;
  v_users uuid[];
  v_unid text[];
  v_u text;
  v_pesq bigint;
  v_rota bigint;
  h int;
  v_opm numeric;
  v_base numeric;
BEGIN
  -- Conta de demonstração (antiga RBN, renomeada para ONDA DEMO / emissora Onda 98.1 em 03/11/2026)
  v_emp := '80fc2113-3112-4471-87c0-08770dd2ccb1';
  SELECT count(*) INTO v_count FROM empresas WHERE id = v_emp;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Conta de demonstração não encontrada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED') THEN
    RAISE EXCEPTION 'Carga principal da demo não encontrada — rode 20261029110000 antes.';
  END IF;
  v_users := ARRAY(SELECT id FROM profiles WHERE empresa_id = v_emp ORDER BY (cargo = 'diretor') DESC, id);
  v_unid := ARRAY(SELECT nome FROM unidades WHERE empresa_id = v_emp ORDER BY nome);
  IF array_length(v_unid, 1) IS NULL THEN v_unid := ARRAY['Onda 98.1']; END IF;

  -- ── 1. Segmento no padrão do cadastro de clientes ──────────────────────────────────
  UPDATE clientes SET segmento = CASE
      WHEN nome_empresa ILIKE '%panific%' OR nome_empresa ILIKE '%padaria%' THEN 'Padaria / Confeitaria'
      WHEN nome_empresa ILIKE '%concession%' THEN 'Concessionária / Loja de Veículos'
      WHEN nome_empresa ILIKE '%auto center%' THEN 'Oficina Mecânica / Auto Center'
      WHEN nome_empresa ILIKE '%ótica%' OR nome_empresa ILIKE '%otica%' THEN 'Clínica Médica / Odontológica'
      WHEN segmento = 'Varejo alimentar' THEN 'Supermercado / Mercado'
      WHEN segmento = 'Farmácia' THEN 'Farmácia / Drogaria'
      WHEN segmento = 'Móveis' THEN 'Loja de Móveis e Decoração'
      WHEN segmento = 'Eletro' THEN 'Loja de Móveis e Decoração'
      WHEN segmento = 'Saúde' THEN 'Clínica Médica / Odontológica'
      WHEN segmento = 'Agro' THEN 'Agropecuária / Agronegócio'
      WHEN segmento = 'Construção' THEN 'Construção Civil / Materiais de Construção'
      WHEN segmento = 'Alimentação' THEN 'Restaurante / Lanchonete'
      WHEN segmento = 'Fitness' THEN 'Academia / Estética / Bem-estar'
      WHEN segmento = 'Educação' THEN 'Educação / Escola / Curso'
      WHEN segmento = 'Vestuário' THEN 'Loja de Roupas / Vestuário'
      WHEN segmento = 'Pet' THEN 'Petshop'
      WHEN segmento = 'Combustíveis' THEN 'Autopeças'
      WHEN segmento = 'Agência' THEN 'Marketing / Publicidade'
      WHEN segmento IN ('Imobiliário', 'Financeiro') THEN 'Consultoria'
      ELSE segmento END
  WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED';

  -- ── 2. Endereço completo (ruas e bairros reais das cidades; números inventados) ─────
  UPDATE clientes c SET
    endereco = e.rua, numero = e.num, bairro = e.bairro,
    email = COALESCE(c.email, 'contato@' || lower(regexp_replace(translate(c.nome_empresa, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC'), '[^A-Za-z0-9]+', '', 'g')) || '.com.br')
  FROM (
    SELECT id, (ARRAY['Rua XV de Novembro', 'Av. Oscar Barcelos', 'Rua Dom Bosco', 'Av. Governador Ivo Silveira', 'Rua XV de Novembro', 'Rua Coronel Feddersen', 'Av. Aristiliano Ramos', 'Rua Marechal Floriano'])[1 + (id % 8)::int] AS rua,
           (100 + (id * 37) % 1900)::text AS num,
           CASE cidade
             WHEN 'Rio do Sul' THEN (ARRAY['Centro', 'Jardim América', 'Canoas', 'Santana', 'Budag'])[1 + (id % 5)::int]
             WHEN 'Ibirama' THEN (ARRAY['Centro', 'Bela Vista', 'Ponto Chic'])[1 + (id % 3)::int]
             WHEN 'Ituporanga' THEN (ARRAY['Centro', 'Bela Vista', 'Gabiroba'])[1 + (id % 3)::int]
             WHEN 'Taió' THEN (ARRAY['Centro', 'Vila Nova'])[1 + (id % 2)::int]
             ELSE 'Centro' END AS bairro
    FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED'
  ) e
  WHERE c.id = e.id AND (c.endereco IS NULL OR c.endereco = '');

  -- ── 3. Origem variada nas vendas demo (só onde ainda está o marcador da carga) ─────
  -- Visita e indicação convertem mais; Instagram traz volume e converte menos.
  UPDATE leads SET origem = CASE
      WHEN tipo = 'Agência' THEN 'Agência'
      WHEN status = 'ganho' THEN (ARRAY['Visita', 'Visita', 'Indicação', 'Indicação', 'Renovação', 'WhatsApp', 'Prospecção ativa', 'Instagram'])[1 + (id % 8)::int]
      ELSE (ARRAY['Instagram', 'Instagram', 'WhatsApp', 'Prospecção ativa', 'Visita', 'Indicação'])[1 + (id % 6)::int] END
  WHERE empresa_id = v_emp AND origem = 'demo_seed';

  -- ── 4. Motivo em toda venda perdida que ainda não tem ────────────────────────────
  -- leads.notas é jsonb: lista de {id, texto, created_at}
  UPDATE leads SET notas = COALESCE(notas, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id', (extract(epoch from now()) * 1000)::bigint + id,
        'texto', '🔴 MOTIVO DA PERDA: ' || (ARRAY[
          'Achou o preço alto para o momento, pediu proposta menor',
          'Fechou com outra rádio da região que deu mais inserções',
          'Sem retorno depois de 3 contatos',
          'Vai investir só depois do fim do ano, retomar em fevereiro',
          'Anunciou antes e disse que não viu resultado',
          'Orçamento de marketing já comprometido com Instagram',
          'Decisão ficou com o sócio, que preferiu não anunciar agora'])[1 + (id % 7)::int],
        'created_at', COALESCE(fechado_em, created_at)))
  WHERE empresa_id = v_emp AND status = 'perdido'
    AND client_id IN (SELECT id FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED')
    AND (notas IS NULL OR (jsonb_typeof(notas) = 'array' AND notas::text NOT LIKE '%MOTIVO DA PERDA%'));

  -- ── 5. Faixa horária nos itens (programa → horário) ──────────────────────────────
  UPDATE leads l SET itens = sub.novos
  FROM (
    SELECT id, jsonb_agg(CASE
        WHEN it ? 'horario_inicial' OR NOT (it ? 'programa') THEN it
        WHEN it->>'programa' ILIKE 'MANH%' THEN it || '{"horario_inicial": "06:00", "horario_final": "09:00"}'::jsonb
        WHEN it->>'programa' ILIKE 'TARDE%' THEN it || '{"horario_inicial": "12:00", "horario_final": "14:00"}'::jsonb
        WHEN it->>'programa' ILIKE 'NOITE%' THEN it || '{"horario_inicial": "17:00", "horario_final": "19:00"}'::jsonb
        ELSE it || '{"horario_inicial": "06:00", "horario_final": "20:00"}'::jsonb END ORDER BY ord) AS novos
    FROM leads, jsonb_array_elements(itens) WITH ORDINALITY AS x(it, ord)
    WHERE empresa_id = v_emp AND jsonb_typeof(itens) = 'array'
      AND client_id IN (SELECT id FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED')
    GROUP BY id
  ) sub
  WHERE l.id = sub.id AND l.itens IS DISTINCT FROM sub.novos;

  -- ── 6. Pesquisa de audiência (se a tabela existir — migration 20261103100000) ─────
  IF to_regclass('public.audiencia_pesquisas') IS NOT NULL THEN
    DELETE FROM audiencia_pesquisas WHERE empresa_id = v_emp AND observacao = 'DEMO-SEED';
    FOREACH v_u IN ARRAY v_unid LOOP
      INSERT INTO audiencia_pesquisas (empresa_id, unidade, fonte, instituto, praca, publico, universo, periodo_inicio, periodo_fim, observacao)
      VALUES (v_emp, v_u, 'instituto', 'Instituto Vale Pesquisas (fictício)', 'Alto Vale do Itajaí', 'Total 10+', 182000,
              date_trunc('quarter', CURRENT_DATE)::date - interval '3 months', date_trunc('quarter', CURRENT_DATE)::date - 1, 'DEMO-SEED')
      RETURNING id INTO v_pesq;
      -- Curva típica de rádio FM no interior: pico 7h-9h, almoço 12h, volta do trabalho 17h-18h.
      FOR h IN 5..23 LOOP
        v_base := CASE
          WHEN h IN (7, 8) THEN 9800 WHEN h = 6 THEN 7200 WHEN h IN (9, 10) THEN 6900 WHEN h = 11 THEN 6100
          WHEN h = 12 THEN 7600 WHEN h = 13 THEN 6300 WHEN h IN (14, 15) THEN 5200 WHEN h = 16 THEN 5600
          WHEN h IN (17, 18) THEN 7400 WHEN h = 19 THEN 4300 WHEN h = 20 THEN 3100 WHEN h = 5 THEN 2600 ELSE 2000 END;
        v_opm := round(v_base * (0.85 + (length(v_u) % 4) * 0.08));
        INSERT INTO audiencia_faixas (pesquisa_id, empresa_id, dia_tipo, hora_inicio, hora_fim, ouvintes_minuto, audiencia_pct, share_pct)
        VALUES
          (v_pesq, v_emp, 'seg_sex', make_time(h, 0, 0), CASE WHEN h = 23 THEN '23:59'::time ELSE make_time(h + 1, 0, 0) END, v_opm, round(v_opm / 182000.0 * 100, 2), round(14 + (v_opm / 1000.0), 1)),
          (v_pesq, v_emp, 'sab', make_time(h, 0, 0), CASE WHEN h = 23 THEN '23:59'::time ELSE make_time(h + 1, 0, 0) END, round(v_opm * 0.72), round(v_opm * 0.72 / 182000.0 * 100, 2), round(12 + (v_opm * 0.72 / 1000.0), 1)),
          (v_pesq, v_emp, 'dom', make_time(h, 0, 0), CASE WHEN h = 23 THEN '23:59'::time ELSE make_time(h + 1, 0, 0) END, round(v_opm * 0.55), round(v_opm * 0.55 / 182000.0 * 100, 2), round(10 + (v_opm * 0.55 / 1000.0), 1));
      END LOOP;
    END LOOP;
  END IF;

  -- ── 7. Rota do Dia de hoje para o primeiro vendedor (6 paradas, 2 já visitadas) ──────
  IF to_regclass('public.rotas_dia') IS NOT NULL AND array_length(v_users, 1) IS NOT NULL THEN
    INSERT INTO rotas_dia (empresa_id, vendedor_id, data, unidade, criado_por)
    VALUES (v_emp, v_users[least(2, array_length(v_users, 1))], CURRENT_DATE, v_unid[1], v_users[1])
    ON CONFLICT (empresa_id, vendedor_id, data) DO NOTHING;
    SELECT id INTO v_rota FROM rotas_dia WHERE empresa_id = v_emp AND vendedor_id = v_users[least(2, array_length(v_users, 1))] AND data = CURRENT_DATE;
    INSERT INTO rotas_dia_paradas (rota_id, empresa_id, vendedor_id, cliente_id, ordem, status, motivo)
    SELECT v_rota, v_emp, v_users[least(2, array_length(v_users, 1))], c.id, row_number() OVER (ORDER BY c.cidade, c.id),
           CASE WHEN row_number() OVER (ORDER BY c.cidade, c.id) <= 2 THEN 'visitada' ELSE 'pendente' END,
           (ARRAY['Contrato vence em 12 dias', 'Sem visita há 45 dias', 'Pediu proposta de fim de ano', 'Cliente novo do segmento que mais compra', 'Parcela em atraso', 'Renovação anual'])[1 + (c.id % 6)::int]
    FROM (SELECT id, cidade FROM clientes WHERE empresa_id = v_emp AND observacao_risco = 'DEMO-SEED' AND cidade = 'Rio do Sul' ORDER BY id LIMIT 6) c
    ON CONFLICT (rota_id, cliente_id) DO NOTHING;
  END IF;

  RAISE NOTICE 'Demo RBN completa: segmentos, endereços, origens, motivos de perda, horários, audiência e Rota do Dia.';
END $demo$;
