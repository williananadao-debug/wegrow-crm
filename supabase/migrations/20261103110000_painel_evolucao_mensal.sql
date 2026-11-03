-- Evolução mensal agregada no banco (03/11/2026): o Dashboard e o Relatório baixavam todas as
-- vendas do ano só pra somar por mês. Esta função devolve 12 linhas (mês, valor, quantidade).
--
-- Mês de referência = mês em que a venda foi ganha (fechado_em) no fuso de Brasília; venda antiga
-- sem fechado_em conta pela data de criação — mesma regra do diaReferenciaLead no front.
-- SECURITY INVOKER: roda com as permissões de quem chama, então a RLS de leads continua valendo
-- (cada um só soma o que já pode ver).

create or replace function public.painel_evolucao_mensal(p_ano int, p_user uuid default null, p_unidade text default null)
returns table (mes int, valor numeric, qtd bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with ini as (
    select make_timestamptz(p_ano, 1, 1, 0, 0, 0, 'America/Sao_Paulo') as a,
           make_timestamptz(p_ano + 1, 1, 1, 0, 0, 0, 'America/Sao_Paulo') as b
  )
  select extract(month from (coalesce(l.fechado_em, l.created_at) at time zone 'America/Sao_Paulo'))::int as mes,
         coalesce(sum(l.valor_total), 0) as valor,
         count(*) as qtd
    from public.leads l, ini
   where l.empresa_id = (select public.meu_empresa_id())
     and l.status = 'ganho'
     and l.deleted_at is null
     and ((l.fechado_em >= ini.a and l.fechado_em < ini.b)
       or (l.fechado_em is null and l.created_at >= ini.a and l.created_at < ini.b))
     and (p_user is null or l.user_id = p_user)
     and (p_unidade is null or l.unidade = p_unidade)
   group by 1
   order by 1;
$$;

grant execute on function public.painel_evolucao_mensal(int, uuid, text) to authenticated;

-- Recarrega o cache da API do Supabase pra função aparecer na hora (sem isso pode dar 404 por alguns minutos)
notify pgrst, 'reload schema';
