-- Gera (ou completa) a Rota do Dia de um vendedor: escolhe entre os PRÓPRIOS clientes dele
-- (mesma amarra de dono usada na Estratégia IA) quem está há mais tempo sem visita, tem
-- contrato vencendo ou está com crédito reprovado, e quem já rendeu mais no histórico —
-- concentrando tudo numa única cidade pra reduzir deslocamento no dia.
-- Idempotente: rodar de novo só complementa paradas novas (ON CONFLICT DO NOTHING),
-- nunca apaga o progresso já registrado.
CREATE OR REPLACE FUNCTION gerar_rota_dia_ia(
  p_vendedor_id UUID,
  p_data        DATE,
  p_empresa_id  UUID,
  p_criado_por  UUID,
  p_limite      INT  DEFAULT 8,
  p_cidade      TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rota_id BIGINT;
  v_cidade  TEXT;
  v_count   INT := 0;
BEGIN
  INSERT INTO rotas_dia (empresa_id, vendedor_id, data, criado_por)
  VALUES (p_empresa_id, p_vendedor_id, p_data, p_criado_por)
  ON CONFLICT (empresa_id, vendedor_id, data) DO NOTHING;

  SELECT id INTO v_rota_id FROM rotas_dia
  WHERE empresa_id = p_empresa_id AND vendedor_id = p_vendedor_id AND data = p_data;

  -- Cidade do dia: a de maior potencial entre os candidatos (valor histórico + urgência de
  -- contrato vencendo), a menos que o diretor tenha forçado uma cidade específica em p_cidade.
  IF p_cidade IS NULL THEN
    SELECT cand.cidade INTO v_cidade
    FROM (
      SELECT
        c.cidade,
        COALESCE(SUM(hist.valor_hist), 0)
          + COALESCE(SUM(CASE WHEN prox.dias_para_vencer IS NOT NULL AND prox.dias_para_vencer <= 90 THEN 5000 ELSE 0 END), 0) AS potencial
      FROM clientes c
      LEFT JOIN LATERAL (
        SELECT SUM(l.valor_total) AS valor_hist FROM leads l WHERE l.client_id = c.id AND l.status = 'ganho'
      ) hist ON true
      LEFT JOIN LATERAL (
        SELECT MIN(l.contrato_fim - CURRENT_DATE) AS dias_para_vencer FROM leads l
        WHERE l.client_id = c.id AND l.status = 'ganho' AND l.contrato_fim IS NOT NULL AND l.contrato_fim >= CURRENT_DATE
      ) prox ON true
      WHERE c.empresa_id = p_empresa_id AND c.user_id = p_vendedor_id AND c.status = 'ativo' AND c.cidade IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rotas_dia_paradas rp WHERE rp.rota_id = v_rota_id AND rp.cliente_id = c.id)
      GROUP BY c.cidade
    ) cand
    ORDER BY cand.potencial DESC
    LIMIT 1;
  ELSE
    v_cidade := p_cidade;
  END IF;

  INSERT INTO rotas_dia_paradas (rota_id, empresa_id, vendedor_id, cliente_id, ordem, status, score, motivo)
  SELECT v_rota_id, p_empresa_id, p_vendedor_id, sub.id,
         ROW_NUMBER() OVER (ORDER BY sub.score DESC), 'pendente', sub.score, sub.motivo
  FROM (
    SELECT
      c.id,
      LEAST(100,
        COALESCE(dias.dias_sem_visita::float / NULLIF(MAX(dias.dias_sem_visita) OVER (), 0), 0) * 40
        + GREATEST(
            CASE WHEN prox.dias_para_vencer IS NOT NULL AND prox.dias_para_vencer <= 90
                 THEN (90 - prox.dias_para_vencer)::float / 90 ELSE 0 END,
            CASE WHEN c.status_risco = 'reprovado' THEN 1 ELSE 0 END
          ) * 30
        + COALESCE(hist.valor_hist / NULLIF(MAX(hist.valor_hist) OVER (), 0), 0) * 30
      ) AS score,
      FORMAT('%s dias sem visita | %s | Valor histórico: R$ %s',
        dias.dias_sem_visita,
        CASE
          WHEN prox.dias_para_vencer IS NOT NULL THEN 'Contrato vence em ' || prox.dias_para_vencer || ' dias'
          WHEN c.status_risco = 'reprovado' THEN 'Cliente reprovado no crédito'
          ELSE 'Sem contrato ativo'
        END,
        TO_CHAR(COALESCE(hist.valor_hist, 0), 'FM999G999D00')
      ) AS motivo
    FROM clientes c
    LEFT JOIN LATERAL (
      SELECT MAX(v.created_at) AS ultima_visita FROM visitas v WHERE v.cliente_id = c.id
    ) uv ON true
    CROSS JOIN LATERAL (
      SELECT COALESCE(EXTRACT(DAY FROM NOW() - uv.ultima_visita)::INT, 9999) AS dias_sem_visita
    ) dias
    LEFT JOIN LATERAL (
      SELECT SUM(l.valor_total) AS valor_hist FROM leads l WHERE l.client_id = c.id AND l.status = 'ganho'
    ) hist ON true
    LEFT JOIN LATERAL (
      SELECT MIN(l.contrato_fim - CURRENT_DATE) AS dias_para_vencer FROM leads l
      WHERE l.client_id = c.id AND l.status = 'ganho' AND l.contrato_fim IS NOT NULL AND l.contrato_fim >= CURRENT_DATE
    ) prox ON true
    WHERE c.empresa_id = p_empresa_id
      AND c.user_id    = p_vendedor_id
      AND c.status     = 'ativo'
      AND (v_cidade IS NULL OR c.cidade = v_cidade)
      AND NOT EXISTS (SELECT 1 FROM rotas_dia_paradas rp WHERE rp.rota_id = v_rota_id AND rp.cliente_id = c.id)
    ORDER BY score DESC
    LIMIT p_limite
  ) sub
  ON CONFLICT (rota_id, cliente_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;
