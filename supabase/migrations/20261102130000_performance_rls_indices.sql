-- Performance (02/11/2026)
--
-- 1) RLS: as policies comparam empresa_id = meu_empresa_id() (e meu_cargo(), auth.uid()) e o
--    Postgres executa a função UMA VEZ POR LINHA lida. Embrulhar em (SELECT ...) faz virar um
--    InitPlan, calculado uma vez por consulta — recomendação oficial do Supabase. A lógica de
--    acesso não muda, só a forma de avaliar. Policies já embrulhadas ficam como estão.
--
-- 2) Índices compostos pros filtros que as telas usam (empresa + data/status).
--
-- Pode rodar de novo sem problema.

-- Uma policy por vez, cada uma no seu bloco: se a tabela estiver ocupada (sistema em uso) ela
-- espera no máximo 3 s e é PULADA em vez de travar tudo (o 1º teste deu deadlock em profiles).
-- Rode de novo até a conferência do fim voltar 0 linhas.
do $$
declare
  p record;
  nova_qual text;
  novo_check text;
  feitas int := 0;
  puladas text := '';
  -- funções sem argumento que as policies chamam: meu_empresa_id(), meu_cargo(),
  -- get_user_empresa() e afins + auth.uid()/auth.jwt()/auth.role()
  padrao_pub  constant text := '(?<!SELECT )(public\.)?((meu|get)_[a-z_]+)\(\)';
  padrao_auth constant text := '(?<!SELECT )auth\.(uid|jwt|role)\(\)';
begin
  perform set_config('lock_timeout', '3s', true);
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ padrao_pub or coalesce(qual, '') ~ padrao_auth
         or coalesce(with_check, '') ~ padrao_pub or coalesce(with_check, '') ~ padrao_auth)
  loop
    nova_qual := regexp_replace(regexp_replace(p.qual, padrao_pub, '(SELECT public.\2())', 'g'), padrao_auth, '(SELECT auth.\1())', 'g');
    novo_check := regexp_replace(regexp_replace(p.with_check, padrao_pub, '(SELECT public.\2())', 'g'), padrao_auth, '(SELECT auth.\1())', 'g');
    begin
      if nova_qual is distinct from p.qual then
        execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, nova_qual);
      end if;
      if novo_check is distinct from p.with_check then
        execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, novo_check);
      end if;
      feitas := feitas + 1;
    exception when lock_not_available or deadlock_detected then
      puladas := puladas || p.tablename || '.' || p.policyname || '  ';
    end;
  end loop;
  raise notice 'Policies ajustadas: %. Puladas (tabela ocupada, rode de novo): %', feitas, coalesce(nullif(puladas, ''), 'nenhuma');
end $$;

set lock_timeout = '10s';

-- Leads: dashboard, relatório, pipeline e metas filtram por empresa + data/status
create index if not exists leads_empresa_created_idx  on public.leads (empresa_id, created_at desc);
create index if not exists leads_empresa_status_idx   on public.leads (empresa_id, status);
create index if not exists leads_empresa_user_idx     on public.leads (empresa_id, user_id);
create index if not exists leads_client_id_idx        on public.leads (client_id) where client_id is not null;
create index if not exists leads_contrato_fim_idx     on public.leads (empresa_id, contrato_fim) where status = 'ganho';

-- Visitas: listas e painéis por empresa + período; ficha do cliente por lead
create index if not exists visitas_empresa_created_idx on public.visitas (empresa_id, created_at desc);
create index if not exists visitas_lead_id_idx         on public.visitas (lead_id) where lead_id is not null;

-- Clientes: busca por nome no cadastro e no casamento de nomes
create index if not exists clientes_empresa_nome_idx on public.clientes (empresa_id, nome_empresa);

-- Produção e financeiro
create index if not exists jobs_empresa_stage_idx           on public.jobs (empresa_id, stage);
create index if not exists jobs_client_id_idx               on public.jobs (client_id) where client_id is not null;
create index if not exists lancamentos_empresa_status_venc_idx on public.lancamentos (empresa_id, status, data_vencimento);

-- Perfis: meu_empresa_id()/meu_cargo() leem profiles pelo id (já é PK) — nada a fazer.

analyze public.leads;
analyze public.visitas;
analyze public.clientes;

-- Conferência: policies que ainda chamam a função por linha (deve voltar 0 linhas)
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and (coalesce(qual, '') ~ '(?<!SELECT )(public\.)?((meu|get)_[a-z_]+)\(\)' or coalesce(qual, '') ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)'
     or coalesce(with_check, '') ~ '(?<!SELECT )(public\.)?((meu|get)_[a-z_]+)\(\)' or coalesce(with_check, '') ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)');
