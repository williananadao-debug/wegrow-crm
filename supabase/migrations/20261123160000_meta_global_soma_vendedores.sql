-- Meta global = soma das metas dos vendedores, só para as rádios novas.
-- As empresas que já existem ficam false (continuam com a meta global digitada à mão);
-- as criadas daqui pra frente nascem true.
alter table public.empresas add column if not exists meta_global_soma boolean not null default false;
alter table public.empresas alter column meta_global_soma set default true;
