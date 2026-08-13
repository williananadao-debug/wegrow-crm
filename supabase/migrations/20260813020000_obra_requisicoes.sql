-- Suprimentos de obra — Fase 2 do plano (fechar gap com o Sienge), item 1.
-- Fase 1 do módulo Obras só marcava uma compra já feita com obra_id
-- (estoque_movimentacoes.obra_id). Isso adiciona o fluxo de verdade:
-- solicitação → aprovação → baixa automática no estoque do Pulse.
-- Ver C:\Users\willi\.claude\plans\cozy-percolating-snail.md

CREATE TABLE IF NOT EXISTS public.obra_requisicoes (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  obra_id        bigint      NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  etapa_id       bigint      REFERENCES public.obra_etapas(id) ON DELETE SET NULL,
  servico_id     bigint      NOT NULL REFERENCES public.servicos(id) ON DELETE RESTRICT,
  quantidade     numeric     NOT NULL,
  status         text        NOT NULL DEFAULT 'solicitada'
                   CHECK (status IN ('solicitada','aprovada','rejeitada','atendida')),
  observacao     text,
  solicitado_por uuid,
  aprovado_por   uuid,
  aprovado_em    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_requisicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obra_requisicoes_select_empresa" ON public.obra_requisicoes;
DROP POLICY IF EXISTS "obra_requisicoes_write_lideranca" ON public.obra_requisicoes;

-- Select fica pra empresa toda (time de obra precisa ver/solicitar), mas
-- aprovar/editar/excluir só diretor/gerente — mesmo padrão de medicoes.
CREATE POLICY "obra_requisicoes_select_empresa" ON public.obra_requisicoes
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "obra_requisicoes_insert_empresa" ON public.obra_requisicoes
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "obra_requisicoes_write_lideranca" ON public.obra_requisicoes
  FOR UPDATE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "obra_requisicoes_delete_lideranca" ON public.obra_requisicoes
  FOR DELETE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

CREATE INDEX IF NOT EXISTS obra_requisicoes_obra_id_idx ON public.obra_requisicoes(obra_id);
CREATE INDEX IF NOT EXISTS obra_requisicoes_empresa_id_idx ON public.obra_requisicoes(empresa_id);
CREATE INDEX IF NOT EXISTS obra_requisicoes_status_idx ON public.obra_requisicoes(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_requisicoes TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
