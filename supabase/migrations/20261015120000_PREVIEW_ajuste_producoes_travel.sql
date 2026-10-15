-- PREVIEW (só leitura) — confira antes de rodar o EXECUTAR.
-- Pedido da Trailer Travel em 15/10/2026: apagar as produções duplicadas #37, #38, #42, #51, #54
-- e voltar a produção do pedido LD-3480, que está em "Entregue".

-- 1) Produções que serão APAGADAS, com o que vai junto (eventos/fotos e aditivos são apagados
--    em cascata; movimentações de estoque só perdem o vínculo).
SELECT p.id, p.produto_final_nome, p.cliente_avulso, p.lead_id, p.status, p.etapa_fabricacao_idx,
       p.previsao_entrega, p.created_at,
       (SELECT count(*) FROM public.pulse_producao_eventos ev WHERE ev.producao_id = p.id) AS eventos,
       (SELECT count(*) FROM public.pulse_aditivos ad WHERE ad.producao_id = p.id)          AS aditivos,
       (SELECT count(*) FROM public.estoque_movimentacoes em WHERE em.producao_id = p.id)   AS mov_estoque
FROM public.pulse_producoes p
JOIN public.empresas e ON e.id = p.empresa_id
WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
  AND p.id IN (37, 38, 42, 51, 54)
ORDER BY p.id;

-- 2) Produção(ões) do LD-3480 e o histórico de status.
SELECT p.id, p.produto_final_nome, p.status, p.etapa_fabricacao_idx, ev.created_at, ev.tipo, ev.texto
FROM public.pulse_producoes p
JOIN public.empresas e ON e.id = p.empresa_id
LEFT JOIN public.pulse_producao_eventos ev ON ev.producao_id = p.id AND ev.tipo IN ('status', 'etapa')
WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = '55496506000125'
  AND p.lead_id = 3480
ORDER BY p.id, ev.created_at;

-- 3) Marcar "Entregue" dispara a NF de entrega (5116) — se saiu alguma pro LD-3480, aparece aqui
--    e precisa ser cancelada no Pulse → Notas Fiscais (até 24h).
SELECT id, status, numero, chave_acesso, ref_focus_nfe, created_at
FROM public.fiscal_notas
WHERE lead_id = 3480 AND chave_nf_referenciada IS NOT NULL
ORDER BY created_at DESC;
