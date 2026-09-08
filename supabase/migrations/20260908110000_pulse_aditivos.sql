-- Aditivo de pedido em produção — cliente pede pra adicionar algo (ex: "quero um teto
-- elétrico") depois que o pedido já está sendo fabricado. Levantado na reunião de
-- descoberta da Trailer Travel (2026-09-08): a edição não pode ser livre — precisa passar
-- por uma alçada restrita à diretoria antes de valer, e quando aprovado tem que já dar
-- baixa automática no estoque dos insumos do item adicionado, igual a venda original já
-- faz.
CREATE TABLE IF NOT EXISTS public.pulse_aditivos (
  id                bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id        uuid        NOT NULL,
  producao_id       bigint      REFERENCES public.pulse_producoes(id) ON DELETE CASCADE,
  lead_id           bigint      REFERENCES public.leads(id) ON DELETE SET NULL,
  itens             jsonb       NOT NULL, -- [{ servicoId, nome, quantidade, precoUnitario }]
  valor_adicional   numeric     NOT NULL DEFAULT 0,
  motivo            text,
  status            text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  solicitado_por    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_por      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pulse_aditivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulse_aditivos_select_empresa" ON public.pulse_aditivos;
DROP POLICY IF EXISTS "pulse_aditivos_insert_empresa" ON public.pulse_aditivos;
DROP POLICY IF EXISTS "pulse_aditivos_update_empresa" ON public.pulse_aditivos;

-- A alçada (só diretor/gerente aprova) é reforçada na UI, mesmo padrão já usado no
-- sistema pra outras restrições por cargo (ex: visibilidade financeira) — RLS aqui só
-- garante isolamento entre empresas, não papel dentro da empresa.
CREATE POLICY "pulse_aditivos_select_empresa" ON public.pulse_aditivos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_aditivos_insert_empresa" ON public.pulse_aditivos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_aditivos_update_empresa" ON public.pulse_aditivos
  FOR UPDATE USING (empresa_id = public.meu_empresa_id()) WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS pulse_aditivos_empresa_id_idx ON public.pulse_aditivos(empresa_id);
CREATE INDEX IF NOT EXISTS pulse_aditivos_producao_id_idx ON public.pulse_aditivos(producao_id);
CREATE INDEX IF NOT EXISTS pulse_aditivos_status_idx ON public.pulse_aditivos(status);

GRANT SELECT, INSERT, UPDATE ON public.pulse_aditivos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
