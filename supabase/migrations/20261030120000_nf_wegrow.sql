-- NFS-e da própria WeGrow (mensalidade dos clientes), emitida pelo Asaas da WeGrow
-- (ASAAS_API_KEY) e enviada por e-mail pro financeiro do cliente. Disparo: botão "Pagamento
-- recebido" no God Mode, pagamento confirmado no Asaas (webhook) ou o cron diário de segurança.
-- Modelo espelhado na NFS-e nº 8 (Trailer Travel, 03/10/2026) emitida pela Contabilizei.

-- E-mail que recebe a nota (financeiro do cliente). Sem ele, cai no e-mail de quem assinou o contrato.
alter table public.clientes_wegrow
  add column if not exists email_financeiro text;

-- Configuração única (1 linha) do modelo da nota.
create table if not exists public.wegrow_nfse_config (
  id                      int         primary key default 1 check (id = 1),
  ativo                   boolean     not null default false,
  municipal_service_id    text,
  municipal_service_code  text        not null default '010101',
  municipal_service_name  text        not null default 'Análise e desenvolvimento de sistemas.',
  descricao               text        not null,
  observacoes             text,
  iss                     numeric     not null default 0,
  retain_iss              boolean     not null default false,
  enviar_email            boolean     not null default true,
  updated_at              timestamptz not null default now()
);

insert into public.wegrow_nfse_config (id, descricao, observacoes)
values (
  1,
  E'Desenvolvimento e licenciamento de programas de computador customizáveis\nMensalidade WeGrow — competência {competencia}\nConta Corrente 43290565-0\nBanco: 336 - Banco C6 S.A.\nAgência: 0001\nChave 66.660.599/0001-06',
  'Conforme Lei 12.741/2012, o percentual total de impostos incidentes neste serviço prestado é de aproximadamente 6.00%'
)
on conflict (id) do nothing;

-- Histórico das notas emitidas (1 por empresa por competência — trava contra nota duplicada).
create table if not exists public.wegrow_notas_fiscais (
  id                 uuid        primary key default gen_random_uuid(),
  empresa_id         uuid        not null references public.empresas(id) on delete cascade,
  competencia        text        not null,                -- 'AAAA-MM'
  valor              numeric     not null,
  asaas_invoice_id   text        unique,
  asaas_payment_id   text,
  status             text        not null default 'SCHEDULED', -- SCHEDULED | SYNCHRONIZED | AUTHORIZED | PROCESSING_CANCELLATION | CANCELED | CANCELLATION_DENIED | ERROR
  numero             text,
  pdf_url            text,
  xml_url            text,
  erro               text,
  email_para         text,
  email_enviado_em   timestamptz,
  origem             text,                                -- manual | pagamento_recebido | webhook | cron
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists wegrow_notas_fiscais_empresa_idx on public.wegrow_notas_fiscais (empresa_id, competencia);

-- Igual clientes_wegrow: faturamento interno, só o service role (rotas /api/admin) mexe.
alter table public.wegrow_nfse_config enable row level security;
alter table public.wegrow_notas_fiscais enable row level security;
grant select, insert, update, delete on public.wegrow_nfse_config, public.wegrow_notas_fiscais to service_role;
