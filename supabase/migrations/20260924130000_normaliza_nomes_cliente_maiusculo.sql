-- Normalização retroativa de caixa (uppercase) nos nomes de cliente — todas as empresas.
-- O formulário de cadastro já MOSTRA o campo em maiúsculo (CSS text-transform), mas isso
-- nunca alterou o texto de verdade salvo no banco; cadastros feitos/editados antes do fix
-- de código (ver commit "fix: nome do cliente saia em minusculo no boleto/Pix...")
-- continuam com a caixa exatamente como foi digitada — o que saía errado em qualquer lugar
-- sem esse mesmo CSS, principalmente no nome impresso no boleto/Pix (Asaas).
--
-- Só muda maiúscula/minúscula (UPPER preserva acentos corretamente em UTF-8) — não perde,
-- reordena nem apaga nenhum dado. Daqui pra frente, o código já salva tudo maiúsculo
-- sozinho (customers/page.tsx), então isso é rodado uma vez só.

UPDATE public.clientes SET nome_empresa = UPPER(nome_empresa)
  WHERE nome_empresa IS NOT NULL AND nome_empresa <> UPPER(nome_empresa);

UPDATE public.clientes SET nome_fantasia = UPPER(nome_fantasia)
  WHERE nome_fantasia IS NOT NULL AND nome_fantasia <> UPPER(nome_fantasia);

UPDATE public.clientes SET razao_social = UPPER(razao_social)
  WHERE razao_social IS NOT NULL AND razao_social <> UPPER(razao_social);

-- leads.empresa é o nome do cliente COPIADO no momento da venda (snapshot) — é esse valor,
-- não o de "clientes", que vai pro título da cobrança/boleto de uma venda já existente.
-- Sem essa linha, um boleto reemitido pra uma venda antiga continuaria saindo errado mesmo
-- depois de corrigir o cadastro do cliente.
UPDATE public.leads SET empresa = UPPER(empresa)
  WHERE empresa IS NOT NULL AND empresa <> UPPER(empresa);
