-- Instrumenta os 4 indicadores que hoje ficam "Sem dado" em /admin/indicadores.
--
-- canal_origem: de onde o cliente veio (ialto/nilton/organico/indicacao/direto) — mesmo
-- vocabulário já usado em wegrow_prospects.canal, agora também na empresa convertida.
-- cancelado_em: quando o cliente foi efetivamente encerrado — "suspensa" hoje só marca
-- inadimplência, não cancelamento; sem essa data não dá pra medir churn de verdade.
alter table public.empresas
  add column if not exists canal_origem text,
  add column if not exists cancelado_em timestamptz;

-- Snapshot mensal do MRR — sem isso não dá pra comparar "MRR novo vs. perdido" mês a mês,
-- só o valor atual existe hoje. Populado por /api/cron/snapshot-mrr, todo dia 1.
create table if not exists public.mrr_snapshots_mensais (
  id          bigint      primary key generated always as identity,
  ano         integer     not null,
  mes         integer     not null,
  mrr_total   numeric     not null,
  clientes    integer     not null,
  criado_em   timestamptz not null default now(),
  unique (ano, mes)
);

grant select, insert, update, delete on public.empresas to service_role;
grant select, insert, update, delete on public.mrr_snapshots_mensais to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Semente do mês corrente — sem isso, a primeira comparação real só aconteceria daqui a
-- 2 meses (precisa de 2 pontos). Valor calculado a partir do clientes_wegrow atual.
insert into public.mrr_snapshots_mensais (ano, mes, mrr_total, clientes)
select
  extract(year from now())::int,
  extract(month from now())::int,
  coalesce(sum(valor_mensal), 0),
  count(*)
from public.clientes_wegrow
on conflict (ano, mes) do nothing;
