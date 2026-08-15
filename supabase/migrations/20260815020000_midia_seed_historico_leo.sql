-- Preenche o histórico de dados manuais (YouTube da rede, Instagram Demais News, Redes
-- sociais) com os números já mostrados no painel do Leo/IAlto — evita digitação manual
-- em Configurações. Trava com RAISE EXCEPTION se não achar exatamente 1 empresa "Demais"
-- (segurança pra não gravar em empresa errada num banco multi-tenant).
DO $$
DECLARE
  v_empresa_id uuid;
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.empresas WHERE nome ILIKE '%demais%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 empresa com nome contendo "demais", achou %. Ajuste o filtro do WHERE antes de rodar.', v_count;
  END IF;

  SELECT id INTO v_empresa_id FROM public.empresas WHERE nome ILIKE '%demais%';

  -- YouTube da rede — visualizações mensais + observação, jan a jul/2026 (print do painel)
  INSERT INTO public.midia_metricas_mensais (empresa_id, ano, mes, youtube_visualizacoes, youtube_observacoes, criado_por, updated_at)
  VALUES
    (v_empresa_id, 2026, 1, 2400, NULL, NULL, now()),
    (v_empresa_id, 2026, 2, 2600, NULL, NULL, now()),
    (v_empresa_id, 2026, 3, 4500, 'Início do Podmais: +54% nas visualizações', NULL, now()),
    (v_empresa_id, 2026, 4, 5300, NULL, NULL, now()),
    (v_empresa_id, 2026, 5, 9100, NULL, NULL, now()),
    (v_empresa_id, 2026, 6, 5200, '101.1 não fez podcast em junho', NULL, now()),
    (v_empresa_id, 2026, 7, 13900, 'Teve 4 podcasts nesse mês.', NULL, now())
  ON CONFLICT (empresa_id, ano, mes) DO UPDATE SET
    youtube_visualizacoes = EXCLUDED.youtube_visualizacoes,
    youtube_observacoes = EXCLUDED.youtube_observacoes,
    updated_at = now();

  -- Instagram Demais News e Redes sociais (rede) — só julho/2026, único mês com número
  -- exato visível no print (meses antes de junho ficam sem informação no painel do Leo).
  UPDATE public.midia_metricas_mensais SET
    instagram_demais_news_visualizacoes = 2300000,
    instagram_demais_news_interacoes = 47600,
    instagram_demais_news_seguidores = 4200,
    redes_sociais_visualizacoes = 21500000,
    redes_sociais_interacoes = 315000,
    redes_sociais_visitas_perfil = 81000,
    updated_at = now()
  WHERE empresa_id = v_empresa_id AND ano = 2026 AND mes = 7;
END $$;
