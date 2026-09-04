-- Fluxo de caixa da própria WeGrow (despesas fixas, ferramentas, entradas avulsas) —
-- hoje o admin/page.tsx calcula "lucro líquido" com um custoFerramentas HARDCODED
-- (50 + 159 + custoSupabase + 115 + 105 + 260), sem nenhum lançamento real por trás.
-- Isso vira uma tabela de verdade, editável, sem depender de mexer em código pra
-- registrar uma ferramenta nova ou uma despesa que mudou de valor.
-- Segue o mesmo padrão de wegrow_prospects/clientes_wegrow: só service role acessa
-- (via API /api/admin/financeiro), sem policy de usuário comum.
create table if not exists public.wegrow_financeiro_lancamentos (
  id bigint primary key generated always as identity,
  tipo text not null check (tipo in ('entrada', 'saida')),
  categoria text not null, -- ferramenta | infra | contabilidade | comissao | imposto | outro (livre)
  descricao text not null,
  valor numeric not null check (valor >= 0),
  recorrente boolean not null default false, -- true = despesa fixa mensal (ex: assinatura de ferramenta), soma todo mês sem precisar recriar
  data date not null default current_date, -- competência do lançamento (não-recorrente) ou data de início (recorrente)
  pago boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wegrow_financeiro_lancamentos enable row level security;
grant select, insert, update, delete on public.wegrow_financeiro_lancamentos to service_role;

create index if not exists wegrow_financeiro_lancamentos_data_idx on public.wegrow_financeiro_lancamentos(data);
create index if not exists wegrow_financeiro_lancamentos_recorrente_idx on public.wegrow_financeiro_lancamentos(recorrente) where recorrente = true;

-- Unique só pra tornar o seed abaixo idempotente (rodar a migration 2x não duplica) —
-- não é uma regra de negócio (nada impede duas despesas com a mesma descrição).
create unique index if not exists wegrow_financeiro_lancamentos_seed_uniq on public.wegrow_financeiro_lancamentos(descricao) where recorrente = true;

-- Seed com os custos fixos que hoje estão hardcoded em admin/page.tsx — assim a tela
-- nova já nasce mostrando o número real que estava escondido no código.
insert into public.wegrow_financeiro_lancamentos (tipo, categoria, descricao, valor, recorrente, data) values
('saida', 'ferramenta', 'Domínio + e-mail transacional (Resend)', 50.00, true, current_date),
('saida', 'ferramenta', 'Vercel (hospedagem)', 159.00, true, current_date),
('saida', 'infra', 'Supabase (banco de dados)', 160.00, true, current_date),
('saida', 'ferramenta', 'DocuSeal (assinatura digital, self-hosted Railway)', 115.00, true, current_date),
('saida', 'ferramenta', 'API DataJud / integrações jurídicas', 105.00, true, current_date),
('saida', 'ferramenta', 'Outras APIs e integrações (IA, WhatsApp, etc.)', 260.00, true, current_date)
on conflict (descricao) where recorrente = true do nothing;
