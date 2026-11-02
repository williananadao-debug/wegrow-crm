-- Marca dupla do parceiro ("WeGrow for Manager"): as rádios da carteira de um parceiro com
-- marca ativa veem o selo "WeGrow for <produto>" com o logo do produto do parceiro no menu, e o
-- parceiro divulga um login com as duas marcas em /entrar/<slug> (ex.: /entrar/manager).
alter table public.parceiros
  add column if not exists marca_produto  text,                  -- ex.: 'Manager'
  add column if not exists marca_logo_url text,                  -- logo do produto do parceiro
  add column if not exists marca_slug     text,                  -- ex.: 'manager' → /entrar/manager
  add column if not exists marca_ativa    boolean not null default false;

create unique index if not exists parceiros_marca_slug_uniq on public.parceiros (lower(marca_slug)) where marca_slug is not null;

-- YoungTech: produto "Manager". Fica desligado até subir o logo no God Mode → Parceiros.
update public.parceiros
   set marca_produto = coalesce(marca_produto, 'Manager'),
       marca_slug    = coalesce(marca_slug, 'manager')
 where nome = 'YoungTech';
