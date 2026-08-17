-- leads.user_id é "responsável atual" (mutável — qualquer diretor/gerente que reabrir e
-- salvar o lead depois de ganho pode trocar sem querer, apagando a atribuição de quem
-- realmente fechou a venda). fechado_por é carimbado UMA VEZ, no momento exato em que o
-- lead entra em status='ganho', e nunca mais muda — é a fonte de verdade pra ranking/meta
-- de vendedor. Reportado pelo Jaisson: seu "realizado" em /goals vinha errado porque
-- dependia só de user_id.
alter table public.leads add column if not exists fechado_por uuid references public.profiles(id) on delete set null;
