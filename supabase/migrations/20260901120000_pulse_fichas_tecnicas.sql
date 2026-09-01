-- Ficha técnica (BOM) por produto final — antes toda produção exigia re-selecionar cada
-- matéria-prima na hora (tela manual gigante), mesmo pra um produto que a fábrica já fabrica
-- toda semana. Agora a composição (quais matérias-primas + quanto de cada por 1 unidade) é
-- cadastrada uma vez e reusada: tanto na produção manual quanto na produção automática
-- disparada por uma venda (Nova Venda).
CREATE TABLE IF NOT EXISTS public.pulse_fichas_tecnicas (
  id                      bigint  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id              uuid    NOT NULL,
  produto_final_id        bigint  NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  servico_id              bigint  NOT NULL REFERENCES public.servicos(id) ON DELETE RESTRICT,
  quantidade_por_unidade  numeric NOT NULL CHECK (quantidade_por_unidade > 0),
  UNIQUE (produto_final_id, servico_id)
);

ALTER TABLE public.pulse_fichas_tecnicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulse_fichas_tecnicas_select_empresa" ON public.pulse_fichas_tecnicas;
DROP POLICY IF EXISTS "pulse_fichas_tecnicas_insert_empresa" ON public.pulse_fichas_tecnicas;
DROP POLICY IF EXISTS "pulse_fichas_tecnicas_update_empresa" ON public.pulse_fichas_tecnicas;
DROP POLICY IF EXISTS "pulse_fichas_tecnicas_delete_empresa" ON public.pulse_fichas_tecnicas;

CREATE POLICY "pulse_fichas_tecnicas_select_empresa" ON public.pulse_fichas_tecnicas
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_fichas_tecnicas_insert_empresa" ON public.pulse_fichas_tecnicas
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_fichas_tecnicas_update_empresa" ON public.pulse_fichas_tecnicas
  FOR UPDATE USING (empresa_id = public.meu_empresa_id()) WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_fichas_tecnicas_delete_empresa" ON public.pulse_fichas_tecnicas
  FOR DELETE USING (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS pulse_fichas_tecnicas_produto_final_id_idx ON public.pulse_fichas_tecnicas(produto_final_id);
CREATE INDEX IF NOT EXISTS pulse_fichas_tecnicas_empresa_id_idx ON public.pulse_fichas_tecnicas(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_fichas_tecnicas TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Rastreia qual venda (lead) disparou a produção automática — nasce direto da venda quando
-- o produto tem ficha técnica, sem passar por nenhum form manual.
ALTER TABLE public.pulse_producoes ADD COLUMN IF NOT EXISTS lead_id bigint REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS pulse_producoes_lead_id_idx ON public.pulse_producoes(lead_id);
