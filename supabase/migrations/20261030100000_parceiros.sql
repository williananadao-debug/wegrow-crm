-- Portal do Parceiro (/parceiro): revendas/integradores (ex.: YoungTech) que vendem, dão
-- suporte e treinamento do WeGrow. O parceiro enxerga SÓ as empresas com parceiro_id dele —
-- nunca o God Mode (lista de todos os clientes, MRR, exclusão).
--
-- parceiros            → cadastro + % de comissão sobre a mensalidade
-- parceiro_usuarios    → e-mails (logins do WeGrow) que podem abrir o portal daquele parceiro
-- empresas.parceiro_id → de qual parceiro é a carteira daquela rádio

create table if not exists public.parceiros (
  id            uuid        primary key default gen_random_uuid(),
  nome          text        not null,
  logo_url      text,
  comissao_pct  numeric     not null default 40,
  ativo         boolean     not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.parceiro_usuarios (
  parceiro_id uuid not null references public.parceiros(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  primary key (parceiro_id, email)
);

alter table public.empresas
  add column if not exists parceiro_id uuid references public.parceiros(id) on delete set null;
create index if not exists empresas_parceiro_id_idx on public.empresas (parceiro_id);

-- Leitura pelo próprio usuário só pra saber SE ele é de algum parceiro (mostra o item no menu).
-- Todo o resto (carteira, comissão, criar rádio, entrar como) passa por /api/parceiro com
-- service role, que confere o e-mail aqui antes de qualquer coisa.
alter table public.parceiros enable row level security;
alter table public.parceiro_usuarios enable row level security;

drop policy if exists parceiro_usuarios_proprio on public.parceiro_usuarios;
create policy parceiro_usuarios_proprio on public.parceiro_usuarios
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists parceiros_do_usuario on public.parceiros;
create policy parceiros_do_usuario on public.parceiros
  for select to authenticated
  using (id in (select pu.parceiro_id from public.parceiro_usuarios pu where lower(pu.email) = lower(auth.jwt() ->> 'email')));

grant select on public.parceiros, public.parceiro_usuarios to authenticated;
grant select, insert, update, delete on public.parceiros, public.parceiro_usuarios to service_role;

-- YoungTech (Joinville/SC). Comissão inicial 40% — ajuste aqui ou no God Mode quando fechar.
insert into public.parceiros (nome, comissao_pct)
select 'YoungTech', 40
where not exists (select 1 from public.parceiros where nome = 'YoungTech');

-- Depois de rodar: os e-mails de quem acessa o portal (logins que já existem no WeGrow, ex.:
-- o diretor da conta de teste deles) são liberados no God Mode → Parceiros.
