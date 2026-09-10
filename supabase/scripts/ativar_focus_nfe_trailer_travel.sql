-- Liga a integração real com o Focus NFe pra Trailer Travel, agora que o certificado
-- digital A1 já foi subido no painel deles.
--
-- Não existe tela de admin pra isso de propósito: fiscal_integracoes guarda token que
-- emite documento fiscal em nome da empresa e só service role enxerga (ver migration
-- 20260908100000). Enquanto não vale a pena construir a tela, o cadastro é feito aqui,
-- na mão, no SQL Editor do Supabase.
--
-- ORDEM DAS COISAS:
--   1. No painel do Focus NFe: pegue o token de PRODUÇÃO e o id da empresa lá dentro.
--   2. Rode o INSERT abaixo trocando os valores.
--   3. Ainda no painel do Focus NFe, cadastre os dois webhooks (URLs no fim do arquivo)
--      com o header x-webhook-secret igual ao webhook_secret que você gerou aqui.
--   4. Habilite o MD-e / "NFe recebidas" na conta — é ele que dispara o webhook de
--      entrada quando um fornecedor emite nota contra o CNPJ da Trailer Travel.

-- gen_random_uuid() serve bem de segredo de webhook: aleatório, 128 bits, e não precisa
-- ser decorado por ninguém — só é copiado uma vez pro painel do Focus NFe.
INSERT INTO public.fiscal_integracoes (
  empresa_id,
  focus_nfe_empresa_id,
  token_producao,
  token_homologacao,
  ambiente_ativo,
  regime_tributario,
  certificado_valido_ate,
  webhook_secret
)
SELECT
  e.id,
  000000,                       -- <<< id da empresa dentro da conta Focus NFe
  'TOKEN_PRODUCAO_AQUI',        -- <<< token de produção do Focus NFe
  'TOKEN_HOMOLOGACAO_AQUI',     -- <<< token de homologação (pode deixar NULL)
  'producao',                   -- certificado subido = pode ir pra produção
  '1',                          -- 1=Simples Nacional, 2=Simples c/ excesso, 3=Normal
  '2027-09-10',                 -- <<< validade do certificado A1 (avisa vencimento)
  gen_random_uuid()::text
FROM public.empresas e
WHERE e.nome ILIKE '%trailer%travel%'
ON CONFLICT (empresa_id) DO UPDATE SET
  focus_nfe_empresa_id   = EXCLUDED.focus_nfe_empresa_id,
  token_producao         = EXCLUDED.token_producao,
  token_homologacao      = EXCLUDED.token_homologacao,
  ambiente_ativo         = EXCLUDED.ambiente_ativo,
  regime_tributario      = EXCLUDED.regime_tributario,
  certificado_valido_ate = EXCLUDED.certificado_valido_ate,
  updated_at             = now();

-- Copie o webhook_secret gerado pra colar no painel do Focus NFe:
SELECT e.nome, fi.webhook_secret, fi.ambiente_ativo, fi.certificado_valido_ate
FROM public.fiscal_integracoes fi
JOIN public.empresas e ON e.id = fi.empresa_id
WHERE e.nome ILIKE '%trailer%travel%';

-- ============================================================================
-- Webhooks a cadastrar no painel do Focus NFe
-- ============================================================================
-- Entrada (nota que fornecedor emitiu contra o CNPJ da Trailer Travel):
--   POST https://www.wegrow.app.br/api/webhooks/focus-nfe/recebida
-- Saída (mudança de status de nota que nós emitimos):
--   POST https://www.wegrow.app.br/api/webhooks/focus-nfe/emitida
-- Header obrigatório nos dois:  x-webhook-secret: <webhook_secret do SELECT acima>
--
-- Sem esse header a rota devolve 401 e a nota não entra — é o que prova que a chamada
-- veio mesmo do Focus NFe.
