-- 19/11/2026: tabelas criadas por SQL direto nasceram sem GRANT para os papéis da API, então a
-- RLS nem chegava a ser avaliada: "permission denied for table ...". Caso que apareceu:
-- encurtar contrato (vendas_ajustes). Varredura achou as outras abaixo. RLS continua valendo.

-- Encurtar contrato (EncurtarContrato.tsx grava pelo navegador; policy limita a liderança)
GRANT SELECT, INSERT ON public.vendas_ajustes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_ajustes TO service_role;

-- Praças/cidades das unidades (dashboard/premises grava pelo navegador; policy: diretor)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades_cidades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades_cidades TO service_role;

-- Portais da empresa (tela /portais pelo navegador, rotas /api/portal com service role,
-- e leitura pública do portal pela policy portal_leitura_publica)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_portais TO authenticated, service_role;
GRANT SELECT ON public.empresa_portais TO anon;

-- Log de auditoria: diretor lê pela policy; gravação só pelo servidor
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO service_role;

-- Crons e rotas que criam notificação/tarefa usam service role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications, public.tarefas TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
