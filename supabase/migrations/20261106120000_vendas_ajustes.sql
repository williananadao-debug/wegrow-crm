-- Encurtar contrato já ganho (pedido da Demais FM, 06/11/2026): o cliente fechou 6 meses e depois
-- pediu só 3. A venda (leads) passa a ter o contrato novo (itens, valor, parcelas, fim), pra OPEC,
-- contrato e portal ficarem certos; o mês em que ela foi ganha continua contando o valor original
-- (leads.valor_fechado) e a diferença entra como ajuste negativo no mês em que o cliente pediu,
-- no nome do vendedor da venda. Assim meta e comissão de meses já pagos não mudam.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS valor_fechado numeric;
COMMENT ON COLUMN public.leads.valor_fechado IS 'Valor da venda quando foi ganha, gravado na primeira redução de contrato. Nulo = nunca reduzida (vale valor_total).';

CREATE TABLE IF NOT EXISTS public.vendas_ajustes (
  id                   bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id           uuid        NOT NULL,
  lead_id              bigint      NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo                 text        NOT NULL DEFAULT 'reducao' CHECK (tipo IN ('reducao')),
  valor                numeric     NOT NULL,             -- diferença, negativa
  valor_antes          numeric     NOT NULL,
  valor_depois         numeric     NOT NULL,
  parcelas_antes       text,
  parcelas_depois      text,
  contrato_fim_antes   date,
  contrato_fim_depois  date,
  itens_antes          jsonb,
  motivo               text        NOT NULL,
  vendedor_id          uuid,                             -- dono da venda (fechado_por ?? user_id)
  vendedor_nome        text,                             -- mesmo vendedor_nome da venda (relatórios agrupam por ele)
  unidade              text,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,  -- quem registrou
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendas_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_ajustes_select_empresa" ON public.vendas_ajustes;
DROP POLICY IF EXISTS "vendas_ajustes_insert_diretor" ON public.vendas_ajustes;

CREATE POLICY "vendas_ajustes_select_empresa" ON public.vendas_ajustes
  FOR SELECT USING (empresa_id = (SELECT public.meu_empresa_id()));
-- Só a diretoria encurta contrato (mesma regra de editar venda com contrato assinado).
-- Sem UPDATE/DELETE: o ajuste é histórico.
CREATE POLICY "vendas_ajustes_insert_diretor" ON public.vendas_ajustes
  FOR INSERT WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()) AND (SELECT public.meu_cargo()) = 'diretor');

CREATE INDEX IF NOT EXISTS vendas_ajustes_empresa_data_idx ON public.vendas_ajustes(empresa_id, created_at);
CREATE INDEX IF NOT EXISTS vendas_ajustes_lead_idx ON public.vendas_ajustes(lead_id);

-- Evolução mensal (Dashboard e Relatório, migration 20261103110000): a venda conta o valor de
-- quando foi ganha e os ajustes entram no mês em que foram registrados. qtd segue contando só
-- vendas (ajuste não é venda nova).
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
  ), linhas as (
    select extract(month from (coalesce(l.fechado_em, l.created_at) at time zone 'America/Sao_Paulo'))::int as mes,
           coalesce(l.valor_fechado, l.valor_total) as valor, 1 as venda
      from public.leads l, ini
     where l.empresa_id = (select public.meu_empresa_id())
       and l.status = 'ganho'
       and l.deleted_at is null
       and ((l.fechado_em >= ini.a and l.fechado_em < ini.b)
         or (l.fechado_em is null and l.created_at >= ini.a and l.created_at < ini.b))
       and (p_user is null or l.user_id = p_user)
       and (p_unidade is null or l.unidade = p_unidade)
    union all
    select extract(month from (v.created_at at time zone 'America/Sao_Paulo'))::int, v.valor, 0
      from public.vendas_ajustes v, ini
     where v.empresa_id = (select public.meu_empresa_id())
       and v.created_at >= ini.a and v.created_at < ini.b
       and (p_user is null or v.vendedor_id = p_user)
       and (p_unidade is null or v.unidade = p_unidade)
  )
  select mes, coalesce(sum(valor), 0) as valor, sum(venda)::bigint as qtd
    from linhas
   group by 1
   order by 1;
$$;

grant execute on function public.painel_evolucao_mensal(int, uuid, text) to authenticated;

NOTIFY pgrst, 'reload schema';
