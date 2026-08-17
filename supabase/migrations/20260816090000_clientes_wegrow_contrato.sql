-- Assinatura digital do CONTRATO DE SERVIÇO da própria WeGrow com seus clientes
-- (contrato_wegrow != contrato de veiculação publicitária que os clientes usam com os
-- anunciantes deles — esse já tem fluxo próprio em leads.docuseal_*). Mesma tabela
-- clientes_wegrow, mesma trava de acesso (só service role / admin).
alter table public.clientes_wegrow
  add column if not exists contrato_template_id text,
  add column if not exists contrato_edit_url text,
  add column if not exists contrato_submission_id text,
  add column if not exists contrato_status text, -- rascunho | enviado | assinado
  add column if not exists contrato_signer_nome text,
  add column if not exists contrato_signer_email text,
  add column if not exists contrato_sign_url text,
  add column if not exists contrato_enviado_em timestamptz,
  add column if not exists contrato_assinado_em timestamptz;

grant select, insert, update, delete on public.clientes_wegrow to service_role;
