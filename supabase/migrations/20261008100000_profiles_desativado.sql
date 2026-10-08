-- Desativar usuário em vez de apagar: corta o acesso (ban no Supabase Auth, feito pela rota
-- /api/team/desativar) e mantém nome/metas/visitas/leads no histórico.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS desativado_em timestamptz;

COMMENT ON COLUMN public.profiles.desativado_em IS
  'Preenchido = usuário desativado (sem acesso). Continua aparecendo no histórico/relatórios; some das listas de atribuição.';

-- leads.criado_por não tinha ON DELETE: apagar o login de quem cadastrou lead falhava no meio
-- (o perfil já tinha sido apagado). Agora o lead fica com criado_por vazio.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_criado_por_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_criado_por_fkey
  FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
