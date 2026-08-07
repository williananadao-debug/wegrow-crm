-- Configuração de emissão de NFS-e por empresa (cada tenant emite nota fiscal
-- pros PRÓPRIOS clientes dela, com o código de serviço/alíquotas específicos
-- do município e regime tributário dela — não dá pra ter um valor padrão
-- seguro aqui, cada empresa preenche o dela em Configurações).
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS nfse_config jsonb;
