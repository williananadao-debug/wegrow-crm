-- Produções em andamento da Trailer Travel (planilha de 15/10/2026), todas como PROJETO
-- PERSONALIZADO (fora do catálogo, sem venda ligada). O nome do cliente fica em
-- cliente_avulso — a fábrica (cargo producao) e o painel da TV não veem, só a liderança.
-- Pode rodar de novo: não duplica (mesmo cliente + projeto já existente é pulado).

ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS cliente_avulso text;

WITH emp AS (
  SELECT e.id, e.modulos
  FROM public.empresas e
  WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
),
-- Etapas configuradas da empresa (Configurações → Etapas de Produção), com o índice 0-based.
etapas AS (
  SELECT (t.ord - 1)::int AS idx, coalesce(t.el->>'nome', t.el #>> '{}') AS nome
  FROM emp, jsonb_array_elements(coalesce(emp.modulos->'pulse_etapas_fabricacao', '[]'::jsonb)) WITH ORDINALITY AS t(el, ord)
),
dados(cliente, modelo, pct, etapa, previsao) AS (VALUES
  ('Ariane',                           NULL,            0,    NULL,         DATE '2026-11-30'),
  ('Alan',                             NULL,            70,   'Marcenaria', DATE '2026-10-09'),
  ('Alex Simões',                      '5ª Roda',       0,    NULL,         DATE '2027-03-15'),
  ('Marcelo Sandri',                   NULL,            0,    'Marcenaria', NULL),
  ('Camila e Gabriel',                 'Caminhão',      65,   'Marcenaria', NULL),
  ('Fernando Capistrane',              '5ª Roda 8 m',   0,    NULL,         DATE '2026-11-02'),
  ('Ennyelson (Acre)',                 '5ª Roda 9 m',   0,    NULL,         DATE '2027-01-30'),
  ('Alexandre (Minas Gerais)',         'Modelo 5,65',   0,    NULL,         DATE '2027-01-30'),
  ('José Luiz (Paraná)',               'Modelo 5,65',   50,   NULL,         DATE '2026-10-16'),
  ('Luiz (padrasto do Ennyelson)',     'Modelo 4.1',    0,    NULL,         DATE '2026-11-30'),
  ('Alessandra',                       '5ª Roda 7,5',   80,   'Marcenaria', DATE '2026-10-16'),
  ('Eduardo',                          'Modelo 4.1',    10,   'Chassi',     DATE '2026-11-16'),
  ('Luiz Carrara',                     'Modelo 4.1',    0,    NULL,         DATE '2026-12-20'),
  ('Luiz Carlos Soave',                NULL,            0,    NULL,         DATE '2027-04-30'),
  ('Mayckon',                          '5ª Roda',       0,    NULL,         DATE '2027-04-30'),
  -- Planilha dizia 05/03/2026 (já passou) — assumido 05/03/2027. Conferir.
  ('Maico',                            'Modelo 5,65',   0,    NULL,         DATE '2027-03-05'),
  ('Maicon',                           'Ônibus',        40,   'Marcenaria', NULL),
  ('Vander Oliveira',                  'Modelo 4.1',    70,   'Marcenaria', DATE '2026-10-13'),
  ('Vanoir',                           'Modelo 5,65',   10,   NULL,         DATE '2026-10-20'),
  ('Cristina (SP)',                    'Modelo 4.1',    0,    NULL,         DATE '2026-12-20'),
  ('Fausto',                           'Modelo 5,65',   10,   NULL,         DATE '2026-11-02'),
  ('Cristiano Cristofolini',           'Modelo 5,65',   0,    NULL,         DATE '2026-12-18'),
  ('Andrei',                           'Modelo 5,65',   5,    NULL,         DATE '2026-12-18'),
  ('Ronaldo Magalhães',                'Modelo 4.1',    10,   NULL,         DATE '2026-11-20'),
  ('André e Indy',                     'Modelo 4.1',    NULL, NULL,         DATE '2027-03-20'),
  ('Jolmir Bosman',                    'Terreno',       0,    NULL,         DATE '2027-03-20')
),
linhas AS (
  SELECT
    d.*,
    'Projeto personalizado' || coalesce(' — ' || d.modelo, '') AS nome_projeto,
    (SELECT et.idx FROM etapas et WHERE d.etapa IS NOT NULL AND et.nome ILIKE d.etapa || '%' ORDER BY et.idx LIMIT 1) AS idx_etapa
  FROM dados d
)
INSERT INTO public.pulse_producoes
  (empresa_id, produto_final_id, produto_final_nome, quantidade_produzida, custo_total, status,
   previsao_entrega, etapa_fabricacao_idx, etapa_iniciada_em, cliente_avulso, observacao)
SELECT
  emp.id, NULL, l.nome_projeto, 1, 0, 'em_producao',
  l.previsao,
  coalesce(l.idx_etapa, 0),
  -- "SEM INICIO" = aguardando a fábrica clicar em Iniciar; com etapa = já em andamento.
  CASE WHEN l.etapa IS NULL THEN NULL ELSE now() END,
  l.cliente,
  'Importado da planilha em 15/10/2026'
    || coalesce(' — ' || l.pct || '% concluído', '')
    || coalesce(' (' || l.etapa || CASE WHEN l.idx_etapa IS NULL THEN ': etapa não encontrada no cadastro, ficou na 1ª' ELSE '' END || ')', '')
    || '.'
FROM linhas l CROSS JOIN emp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pulse_producoes p
  WHERE p.empresa_id = emp.id AND p.cliente_avulso = l.cliente AND p.produto_final_nome = l.nome_projeto
);

-- Conferência: o que ficou cadastrado e em qual etapa.
SELECT p.id, p.cliente_avulso, p.produto_final_nome, p.previsao_entrega,
       p.etapa_fabricacao_idx, et.nome AS etapa, p.etapa_iniciada_em IS NOT NULL AS iniciada, p.observacao
FROM public.pulse_producoes p
JOIN public.empresas e ON e.id = p.empresa_id
LEFT JOIN LATERAL (
  SELECT coalesce(x.el->>'nome', x.el #>> '{}') AS nome
  FROM jsonb_array_elements(coalesce(e.modulos->'pulse_etapas_fabricacao', '[]'::jsonb)) WITH ORDINALITY AS x(el, ord)
  WHERE x.ord - 1 = p.etapa_fabricacao_idx
) et ON true
WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
  AND p.cliente_avulso IS NOT NULL
ORDER BY p.previsao_entrega NULLS LAST;
