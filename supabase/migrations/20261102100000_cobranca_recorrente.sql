-- Cobrança recorrente da própria WeGrow (mensalidade de quem assina o sistema), pela conta Asaas
-- da WeGrow (ASAAS_API_KEY):
--
--  * assinatura mensal no Asaas por cliente  → boleto/Pix gerado sozinho todo mês
--  * split de pagamento pro parceiro          → a comissão (ex.: 40% YoungTech) cai na carteira
--                                               Asaas dele no ato do pagamento, sem repasse manual
--  * régua de cobrança                        → lembrete antes, avisos depois do vencimento e,
--                                               se ligado, suspensão do acesso após N dias
--  * extrato (wegrow_pagamentos)              → todo pagamento das assinaturas, com o valor do
--                                               split, pro God Mode e pro Portal do Parceiro
--
-- Antes: cobrança avulsa gerada à mão mês a mês (/api/admin/cobranca) e comissão calculada à mão.

-- Assinatura do cliente
alter table public.clientes_wegrow
  add column if not exists asaas_subscription_id text,
  add column if not exists assinatura_status     text,          -- ativa | cancelada
  add column if not exists forma_pagamento       text default 'UNDEFINED', -- BOLETO | PIX | CREDIT_CARD | UNDEFINED (cliente escolhe)
  add column if not exists em_atraso_desde       date;

-- Carteira Asaas do parceiro pra receber o split
alter table public.parceiros
  add column if not exists asaas_wallet_id text,
  add column if not exists split_base      text not null default 'bruto'; -- bruto: % do valor cheio · liquido: % do valor após a tarifa do Asaas

do $$ begin
  alter table public.parceiros add constraint parceiros_split_base_chk check (split_base in ('bruto', 'liquido'));
exception when duplicate_object then null; end $$;

-- Acesso suspenso por pendência financeira (nulo = liberado). O app mostra a tela de pendência
-- pra todos os usuários da empresa enquanto estiver preenchido; o pagamento libera sozinho.
alter table public.empresas
  add column if not exists bloqueio_cobranca_em timestamptz;

-- Pagamentos das assinaturas (espelho do Asaas, alimentado pelo webhook e pelo cron)
create table if not exists public.wegrow_pagamentos (
  id                    bigint primary key generated always as identity,
  asaas_payment_id      text not null unique,
  asaas_subscription_id text,
  empresa_id            uuid references public.empresas(id) on delete set null,
  parceiro_id           uuid references public.parceiros(id) on delete set null,
  competencia           text,            -- 'AAAA-MM' (mês do vencimento)
  valor                 numeric not null default 0,
  valor_liquido         numeric,          -- depois da tarifa do Asaas
  vencimento            date,
  pago_em               date,
  status                text,             -- PENDING | RECEIVED | CONFIRMED | OVERDUE | REFUNDED | RECEIVED_IN_CASH | DELETED ...
  forma                 text,             -- BOLETO | PIX | CREDIT_CARD | UNDEFINED
  invoice_url           text,
  split_valor           numeric,          -- quanto foi (ou vai) pro parceiro
  split_status          text,             -- PENDING | AWAITING_CREDIT | DONE | CANCELLED | REFUSED ...
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists wegrow_pagamentos_empresa_idx  on public.wegrow_pagamentos (empresa_id, vencimento desc);
create index if not exists wegrow_pagamentos_parceiro_idx on public.wegrow_pagamentos (parceiro_id, vencimento desc);
create index if not exists wegrow_pagamentos_status_idx   on public.wegrow_pagamentos (status, vencimento);

-- Etapas da régua já enviadas por pagamento (não manda o mesmo aviso duas vezes)
create table if not exists public.wegrow_regua_envios (
  asaas_payment_id text not null,
  etapa            text not null,   -- lembrete | vencido | atraso_5 | aviso_suspensao | suspenso
  email_para       text,
  enviado_em       timestamptz not null default now(),
  primary key (asaas_payment_id, etapa)
);

-- Regras da cobrança (linha única, id = 1)
create table if not exists public.wegrow_cobranca_config (
  id                   int primary key default 1 check (id = 1),
  regua_ativa          boolean not null default true,
  dias_lembrete        int     not null default 3,    -- e-mail X dias antes do vencimento
  suspensao_automatica boolean not null default false, -- liga só depois de conferir a régua rodando
  dias_suspensao       int     not null default 15,   -- dias de atraso até suspender
  multa_pct            numeric not null default 2,    -- multa após o vencimento (%)
  juros_mes_pct        numeric not null default 1,    -- juros ao mês (%)
  updated_at           timestamptz not null default now()
);
insert into public.wegrow_cobranca_config (id) values (1) on conflict (id) do nothing;

-- Só service role (via /api/admin/* e /api/parceiro): dado financeiro interno da WeGrow
alter table public.wegrow_pagamentos      enable row level security;
alter table public.wegrow_regua_envios    enable row level security;
alter table public.wegrow_cobranca_config enable row level security;
grant select, insert, update, delete on public.wegrow_pagamentos, public.wegrow_regua_envios, public.wegrow_cobranca_config to service_role;
