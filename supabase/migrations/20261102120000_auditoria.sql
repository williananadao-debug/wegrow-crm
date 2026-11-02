-- Registro de quem fez o quê nas ações sensíveis da plataforma: WeGrow ou parceiro entrando na
-- conta de um cliente ("entrar como"/suporte), senha gerada, empresa criada, módulos/plano
-- alterados, cobrança (assinatura, liberação de acesso, régua) e comissão/carteira/marca de
-- parceiro. Só a service role escreve/lê (via /api/admin/auditoria); nunca o tenant.
create table if not exists public.auditoria (
  id          bigint primary key generated always as identity,
  criado_em   timestamptz not null default now(),
  ator_email  text,
  ator_tipo   text not null default 'wegrow',   -- wegrow | parceiro | sistema
  parceiro_id uuid references public.parceiros(id) on delete set null,
  empresa_id  uuid references public.empresas(id) on delete set null,
  acao        text not null,                    -- ex.: suporte.entrar_como, senha.gerar, cobranca.assinatura
  detalhe     jsonb
);
create index if not exists auditoria_empresa_idx  on public.auditoria (empresa_id, criado_em desc);
create index if not exists auditoria_parceiro_idx on public.auditoria (parceiro_id, criado_em desc);
create index if not exists auditoria_criado_idx   on public.auditoria (criado_em desc);

alter table public.auditoria enable row level security;
grant select, insert on public.auditoria to service_role;
