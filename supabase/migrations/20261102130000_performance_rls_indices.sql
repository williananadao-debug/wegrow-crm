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

do $$
declare
  p record;
  nova_qual text;
  novo_check text;
  padrao_emp   constant text := '(?<!SELECT )(public\.)?meu_empresa_id\(\)';
  padrao_cargo constant text := '(?<!SELECT )(public\.)?meu_cargo\(\)';
  padrao_uid   constant text := '(?<!SELECT )auth\.uid\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ '(meu_empresa_id|meu_cargo)\(\)|auth\.uid\(\)'
         or coalesce(with_check, '') ~ '(meu_empresa_id|meu_cargo)\(\)|auth\.uid\(\)')
  loop
    nova_qual := p.qual;
    novo_check := p.with_check;
    if nova_qual is not null then
      nova_qual := regexp_replace(nova_qual, padrao_emp, '(SELECT public.meu_empresa_id())', 'g');
      nova_qual := regexp_replace(nova_qual, padrao_cargo, '(SELECT public.meu_cargo())', 'g');
      nova_qual := regexp_replace(nova_qual, padrao_uid, '(SELECT auth.uid())', 'g');
    end if;
    if novo_check is not null then
      novo_check := regexp_replace(novo_check, padrao_emp, '(SELECT public.meu_empresa_id())', 'g');
      novo_check := regexp_replace(novo_check, padrao_cargo, '(SELECT public.meu_cargo())', 'g');
      novo_check := regexp_replace(novo_check, padrao_uid, '(SELECT auth.uid())', 'g');
    end if;
    if nova_qual is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, nova_qual);
    end if;
    if novo_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, novo_check);
    end if;
  end loop;
end $$;

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

-- Conferência: nenhuma policy deve sobrar chamando a função sem SELECT (deve voltar 0 linhas)
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and (coalesce(qual, '') ~ '(?<!SELECT )(public\.)?meu_empresa_id\(\)'
     or coalesce(with_check, '') ~ '(?<!SELECT )(public\.)?meu_empresa_id\(\)');
