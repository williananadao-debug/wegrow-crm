-- App do cliente do Rastreio: login permanente (CPF/CNPJ ou celular + senha), além do link de uso único.
alter table public.rastreio_clientes add column if not exists app_login text;               -- só dígitos (CPF/CNPJ ou celular)
alter table public.rastreio_clientes add column if not exists app_senha_hash text;          -- scrypt "salt:hash"
alter table public.rastreio_clientes add column if not exists app_senha_erros int not null default 0;
alter table public.rastreio_clientes add column if not exists app_senha_bloqueio_ate timestamptz;
create index if not exists rastreio_clientes_app_login_idx on public.rastreio_clientes(app_login) where app_login is not null;
notify pgrst, 'reload schema';
