-- Correções: adiciona p_unidade + valor_total para leads de mix
CREATE OR REPLACE FUNCTION gerar_estrategia_ia_v2(
  p_tipo         TEXT,
  p_dias_inativo INT     DEFAULT 60,
  p_vendedor_id  UUID    DEFAULT NULL,
  p_produto_foco TEXT    DEFAULT NULL,
  p_criado_por   UUID    DEFAULT NULL,
  p_empresa_id   UUID    DEFAULT NULL,
  p_limite       INT     DEFAULT 5,
  p_unidade      TEXT    DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count         INT := 0;
  v_destino       UUID;
  v_preco_produto NUMERIC := 0;
BEGIN

  -- Vendedor destino: específico ou quem tem menos leads abertos
  IF p_vendedor_id IS NOT NULL THEN
    v_destino := p_vendedor_id;
  ELSE
    SELECT p.id INTO v_destino
    FROM profiles p
    LEFT JOIN leads l ON l.user_id = p.id AND l.empresa_id = p_empresa_id AND l.status IN ('aberto','negociacao')
    WHERE p.empresa_id = p_empresa_id AND p.cargo NOT IN ('diretor','gerente')
    GROUP BY p.id
    ORDER BY COUNT(l.id) ASC
    LIMIT 1;
  END IF;

  -- Busca preço do produto foco (usado como valor sugerido nos leads de mix)
  IF p_produto_foco IS NOT NULL THEN
    SELECT COALESCE(preco, 0) INTO v_preco_produto
    FROM servicos
    WHERE empresa_id = p_empresa_id
      AND nome ILIKE '%' || p_produto_foco || '%'
    ORDER BY preco DESC
    LIMIT 1;
  END IF;

  -- Se não achou o produto foco, usa média dos serviços da empresa
  IF v_preco_produto = 0 THEN
    SELECT COALESCE(AVG(preco), 0) INTO v_preco_produto
    FROM servicos
    WHERE empresa_id = p_empresa_id;
  END IF;

  -- ================================================================
  -- RESGATE: clientes com compra anterior mas sem lead ativo hoje
  -- ================================================================
  IF p_tipo = 'resgate' THEN

    INSERT INTO leads (empresa, status, etapa, user_id, origem, descricao, valor_total, empresa_id, client_id, cidade, unidade)
    SELECT
      sub.empresa,
      'aberto',
      0,
      COALESCE(v_destino, sub.user_id_orig),
      'Estratégia — Resgate de Inativos',
      FORMAT(
        '📊 Score %s/100 | Última compra: %s dias atrás | Valor histórico: R$ %s | %s',
        sub.score::INT,
        sub.dias_inativo,
        TO_CHAR(sub.valor_hist, 'FM999G999D00'),
        COALESCE(p_produto_foco, 'Reativar conta')
      ),
      sub.valor_hist,
      p_empresa_id,
      sub.client_id,
      sub.cidade,
      COALESCE(p_unidade, sub.unidade)
    FROM (
      SELECT
        l.client_id,
        l.empresa,
        l.valor_total                                                    AS valor_hist,
        l.user_id                                                        AS user_id_orig,
        l.cidade,
        l.unidade,
        EXTRACT(DAY FROM NOW() - MAX(l.created_at))::INT                AS dias_inativo,
        LEAST(100,
          (l.valor_total / NULLIF(MAX(l.valor_total) OVER (), 0) * 60)
          + (1.0 / NULLIF(EXTRACT(DAY FROM NOW() - MAX(l.created_at)), 0) * 4000 * 0.4)
        )                                                                AS score
      FROM leads l
      WHERE l.empresa_id  = p_empresa_id
        AND l.status      = 'ganho'
        AND l.client_id   IS NOT NULL
        AND EXTRACT(DAY FROM NOW() - l.created_at) >= p_dias_inativo
        AND (p_unidade IS NULL OR l.unidade = p_unidade)
        AND NOT EXISTS (
          SELECT 1 FROM leads la
          WHERE la.client_id  = l.client_id
            AND la.empresa_id = p_empresa_id
            AND la.status IN ('aberto','negociacao')
        )
      GROUP BY l.client_id, l.empresa, l.valor_total, l.user_id, l.cidade, l.unidade
      ORDER BY score DESC
      LIMIT p_limite
    ) sub;

    GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ================================================================
  -- CHURN: contratos vencendo nos próximos 90 dias
  -- ================================================================
  ELSIF p_tipo = 'churn' THEN

    INSERT INTO leads (empresa, status, etapa, user_id, origem, descricao, valor_total, empresa_id, client_id, cidade, unidade)
    SELECT
      sub.empresa,
      'aberto',
      0,
      COALESCE(v_destino, sub.user_id_orig),
      'Estratégia — Renovação de Contrato',
      FORMAT(
        '⚠️ Score %s/100 | Contrato vence em %s dias | Valor atual: R$ %s | %s',
        sub.score::INT,
        sub.dias_para_vencer,
        TO_CHAR(sub.valor_contrato, 'FM999G999D00'),
        COALESCE(p_produto_foco, 'Proposta de renovação')
      ),
      sub.valor_contrato,
      p_empresa_id,
      sub.client_id,
      sub.cidade,
      COALESCE(p_unidade, sub.unidade)
    FROM (
      SELECT
        l.client_id,
        l.empresa,
        l.valor_total                                                        AS valor_contrato,
        l.user_id                                                            AS user_id_orig,
        l.cidade,
        l.unidade,
        (l.contrato_fim - CURRENT_DATE)                                      AS dias_para_vencer,
        LEAST(100,
          ((90 - (l.contrato_fim - CURRENT_DATE)::FLOAT) / 90 * 50)
          + (l.valor_total / NULLIF(MAX(l.valor_total) OVER (), 0) * 50)
        )                                                                    AS score
      FROM leads l
      WHERE l.empresa_id   = p_empresa_id
        AND l.status       = 'ganho'
        AND l.contrato_fim IS NOT NULL
        AND l.contrato_fim BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
        AND (p_unidade IS NULL OR l.unidade = p_unidade)
        AND NOT EXISTS (
          SELECT 1 FROM leads la
          WHERE la.client_id  = l.client_id
            AND la.empresa_id = p_empresa_id
            AND la.status IN ('aberto','negociacao')
            AND la.origem ILIKE '%Renova%'
        )
      ORDER BY score DESC
      LIMIT p_limite
    ) sub;

    GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ================================================================
  -- MIX: clientes cadastrados que nunca compraram
  -- ================================================================
  ELSIF p_tipo = 'mix' THEN

    INSERT INTO leads (empresa, status, etapa, user_id, origem, descricao, valor_total, empresa_id, client_id, cidade, unidade)
    SELECT
      sub.nome_empresa,
      'aberto',
      0,
      COALESCE(v_destino, sub.user_id_orig),
      'Estratégia — Primeira Compra',
      FORMAT(
        '🎯 Score %s/100 | Limite crédito: R$ %s | Risco: %s | %s',
        sub.score::INT,
        TO_CHAR(COALESCE(sub.limite_credito, 0), 'FM999G999D00'),
        COALESCE(sub.status_risco, 'em análise'),
        COALESCE(p_produto_foco, 'Prospecção ativa')
      ),
      v_preco_produto,
      p_empresa_id,
      sub.id,
      sub.cidade,
      p_unidade
    FROM (
      SELECT
        c.id,
        c.nome_empresa,
        c.cidade,
        c.score_interno,
        c.limite_credito,
        c.status_risco,
        c.user_id                                                   AS user_id_orig,
        LEAST(100,
          COALESCE(c.score_interno, 0) * 0.5
          + (COALESCE(c.limite_credito, 0) / NULLIF(MAX(c.limite_credito) OVER (), 0) * 30)
          + CASE WHEN c.status_risco = 'aprovado' THEN 20 ELSE 0 END
        )                                                           AS score
      FROM clientes c
      WHERE c.empresa_id = p_empresa_id
        AND c.status     = 'ativo'
        AND NOT EXISTS (
          SELECT 1 FROM leads l
          WHERE l.client_id  = c.id
            AND l.empresa_id = p_empresa_id
            AND l.status     = 'ganho'
        )
        AND NOT EXISTS (
          SELECT 1 FROM leads l
          WHERE l.client_id  = c.id
            AND l.empresa_id = p_empresa_id
            AND l.status IN ('aberto','negociacao')
        )
      ORDER BY score DESC
      LIMIT p_limite
    ) sub;

    GET DIAGNOSTICS v_count = ROW_COUNT;

  END IF;

  -- Salva no histórico de premissas
  IF v_count > 0 THEN
    INSERT INTO premissas (titulo, quantidade, regiao, tipo_cliente, user_id, criado_por, empresa_id)
    VALUES (
      CASE p_tipo
        WHEN 'resgate' THEN 'Estratégia — Resgate de Inativos'
        WHEN 'churn'   THEN 'Estratégia — Renovação de Contrato'
        WHEN 'mix'     THEN 'Estratégia — Primeira Compra'
        ELSE                'Estratégia IA'
      END,
      v_count,
      COALESCE(p_unidade, p_produto_foco, 'Geral'),
      'Recuperação',
      COALESCE(v_destino, p_criado_por),
      p_criado_por,
      p_empresa_id
    );
  END IF;

  RETURN v_count;

END;
$$;
