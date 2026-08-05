-- Rastreia quem de fato cadastrou o lead, separado de quem é o vendedor responsável
-- (user_id). Necessário pro usuário OPEC: ele pode abrir/cadastrar um lead atribuindo
-- a outro vendedor, e precisa continuar enxergando esse lead depois mesmo não sendo
-- o dono -- sem esse campo não dava pra distinguir "lead que o OPEC criou pra alguém"
-- de "lead de qualquer outro vendedor que o OPEC nunca tocou".
alter table public.leads
  add column if not exists criado_por uuid references auth.users(id);

comment on column public.leads.criado_por is 'Quem cadastrou o lead (pode ser diferente de user_id, o vendedor responsável). Usado pra dar visibilidade ao OPEC nos leads que ele mesmo abriu pra outros vendedores.';
