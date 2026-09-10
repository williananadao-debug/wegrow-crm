-- Gera o lançamento (conta a pagar 'pendente') retroativamente pra toda nota de entrada
-- que já está em fiscal_notas mas foi criada ANTES da mudança que faz isso
-- automaticamente (backfill/webhook a partir de 2026-09-10). Sem isso, só as notas
-- criadas depois desse commit vão aparecer em Financeiro.
--
-- Vencimento estimado em D+30 da emissão (a NF-e em si não carrega data de vencimento,
-- isso é duplicata/boleto) — ajuste manual depois se souber o prazo real combinado com
-- cada fornecedor.
--
-- Roda dentro de transação — confere o SELECT de verificação antes do COMMIT.

BEGIN;

WITH alvo AS (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%'),
notas_sem_lancamento AS (
  SELECT id, nome_participante, cnpj_participante, valor_total, numero, serie, chave_acesso, data_emissao
  FROM public.fiscal_notas
  WHERE empresa_id IN (SELECT id FROM alvo)
    AND tipo = 'entrada'
    AND status <> 'cancelada'
    AND valor_total IS NOT NULL
    AND lancamento_id IS NULL
),
inseridos AS (
  INSERT INTO public.lancamentos (
    titulo, valor, tipo, categoria, status, data_vencimento, empresa_id,
    nf_numero, nf_serie, nf_chave_acesso, nf_data_emissao, nf_fornecedor_cnpj
  )
  SELECT
    'Nota Fiscal - ' || COALESCE(n.nome_participante, 'Fornecedor'),
    n.valor_total, 'saida', 'Fornecedor', 'pendente',
    (COALESCE(n.data_emissao, CURRENT_DATE) + INTERVAL '30 days')::date,
    (SELECT id FROM alvo),
    n.numero, n.serie, n.chave_acesso, n.data_emissao, n.cnpj_participante
  FROM notas_sem_lancamento n
  RETURNING id, nf_chave_acesso
)
UPDATE public.fiscal_notas fn
SET lancamento_id = i.id
FROM inseridos i
WHERE fn.chave_acesso = i.nf_chave_acesso
  AND fn.empresa_id IN (SELECT id FROM alvo);

-- Confere: tem que bater com a quantidade que apareceu no BLOCO de inventário acima
SELECT count(*) AS lancamentos_criados_agora FROM public.lancamentos
WHERE empresa_id IN (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
  AND categoria = 'Fornecedor' AND status = 'pendente';

COMMIT;
