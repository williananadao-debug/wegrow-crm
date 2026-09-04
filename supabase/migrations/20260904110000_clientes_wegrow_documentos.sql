-- Estende o rastreamento de "documento pra assinar" de clientes_wegrow pra cobrir 2
-- coisas novas:
-- 1) contrato_arquivo_path — o Docuseal self-hosted (plano free) bloqueia os endpoints
--    de criar template via API (/templates/pdf, /templates/html retornam 404 "Pro
--    Edition") — descoberto ao tentar automatizar o envio do contrato da Trailer
--    Travel. Sem upload automático, o PDF gerado precisa ficar em algum lugar pro admin
--    baixar e subir manualmente no painel do Docuseal — daí o bucket + path.
-- 2) cronograma_* — mesmo rastreamento que contrato_* já tinha, mas pra um segundo tipo
--    de documento (cronograma de implantação), que também precisa ir pro Docuseal
--    manualmente. Reaproveita clientes_wegrow em vez de criar tabela nova porque é
--    1:1 com a empresa, igual contrato.

alter table public.clientes_wegrow
  add column if not exists contrato_arquivo_path text,
  add column if not exists cronograma_arquivo_path text,
  add column if not exists cronograma_status text, -- rascunho | gerado | enviado | assinado
  add column if not exists cronograma_signer_nome text,
  add column if not exists cronograma_signer_email text,
  add column if not exists cronograma_sign_url text,
  add column if not exists cronograma_enviado_em timestamptz,
  add column if not exists cronograma_assinado_em timestamptz;

comment on column public.clientes_wegrow.contrato_status is 'rascunho | gerado | enviado | assinado — "gerado" = PDF pronto no bucket, aguardando upload manual no Docuseal (endpoint de criação via API é Pro-only no self-hosted atual)';

-- Bucket privado pra guardar os PDFs de trabalho (contrato + cronograma) ANTES de irem
-- pro Docuseal — distinto de "contratos-assinados" (que é o arquivo pós-assinatura,
-- baixado do Docuseal pelo webhook). Só service role acessa; admin baixa via signed URL.
insert into storage.buckets (id, name, public)
values ('wegrow-documentos', 'wegrow-documentos', false)
on conflict (id) do nothing;
