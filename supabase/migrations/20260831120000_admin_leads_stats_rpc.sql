-- /api/admin/atividade puxava a tabela `leads` INTEIRA (todas as empresas, todos os
-- tempos, sem limit) só pra contar "leads do mês" e "leads total" por empresa em JS —
-- e essa rota roda de novo a cada ação do God Mode (criar empresa, resetar senha,
-- excluir, registrar pagamento), via carregarEmpresas(). Substituído por uma agregação
-- feita no Postgres: retorna 1 linha por empresa (já contada), não 1 linha por lead.
CREATE OR REPLACE FUNCTION public.admin_leads_stats()
RETURNS TABLE (empresa_id uuid, leads_total bigint, leads_mes bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    empresa_id,
    count(*) AS leads_total,
    count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS leads_mes
  FROM public.leads
  GROUP BY empresa_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_leads_stats() TO authenticated, service_role;
