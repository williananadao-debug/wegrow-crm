-- Bucket privado para armazenar contratos assinados + certificado de auditoria do Docuseal
insert into storage.buckets (id, name, public)
values ('contratos-assinados', 'contratos-assinados', false)
on conflict (id) do nothing;

-- Registro dos arquivos arquivados por lead (nome + caminho no bucket acima)
alter table public.leads add column if not exists docuseal_arquivos jsonb default '[]';
