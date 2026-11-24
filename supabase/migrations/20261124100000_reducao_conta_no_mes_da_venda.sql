-- Encurtar contrato (24/11/2026, pedido da Demais FM): a venda passa a contar o valor ATUAL
-- (valor_total, já reduzido) no mês em que foi ganha, igual ao Pipeline. O ajuste negativo não
-- entra mais no mês em que o cliente pediu (deixava Metas diferente do Pipeline e o mês atual
-- negativo). vendas_ajustes fica só como histórico.
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
         coalesce(sum(l.valor_total), 0) as valor, count(*)::bigint as qtd
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
NOTIFY pgrst, 'reload schema';
