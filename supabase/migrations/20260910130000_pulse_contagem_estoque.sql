-- Contagem física de estoque — bate o número do sistema com o que tem de verdade no
-- galpão, e gera o ajuste automático (mesmo motivo 'contagem' que estoque_movimentacoes
-- já suportava, só que agora tem um fluxo de verdade em vez de só um número de ajuste
-- avulso). Uma contagem é uma sessão: nasce com uma "foto" do estoque atual de cada
-- produto (estoque_sistema), alguém vai preenchendo o que contou fisicamente
-- (estoque_contado, pode ser em várias idas/vindas — cada item salva na hora), e ao
-- concluir só os itens com diferença geram movimento no Kardex.

CREATE TABLE IF NOT EXISTS public.pulse_contagens (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  status         text        NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida', 'cancelada')),
  observacao     text,
  iniciado_por   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_por  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_em   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pulse_contagens_itens (
  id                       bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  contagem_id              bigint      NOT NULL REFERENCES public.pulse_contagens(id) ON DELETE CASCADE,
  servico_id               bigint      REFERENCES public.servicos(id) ON DELETE SET NULL,
  nome_produto             text        NOT NULL, -- snapshot — produto pode ser apagado/renomeado depois, o registro da contagem não pode sumir junto
  estoque_sistema          numeric     NOT NULL, -- o que o sistema tinha no momento em que a contagem começou
  estoque_contado          numeric,               -- null até alguém contar fisicamente e preencher
  estoque_movimentacao_id  bigint      REFERENCES public.estoque_movimentacoes(id) ON DELETE SET NULL,
  contado_por              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  contado_em               timestamptz
);

ALTER TABLE public.pulse_contagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_contagens_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulse_contagens_select_empresa" ON public.pulse_contagens;
DROP POLICY IF EXISTS "pulse_contagens_insert_empresa" ON public.pulse_contagens;
DROP POLICY IF EXISTS "pulse_contagens_update_empresa" ON public.pulse_contagens;
CREATE POLICY "pulse_contagens_select_empresa" ON public.pulse_contagens
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_contagens_insert_empresa" ON public.pulse_contagens
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());
CREATE POLICY "pulse_contagens_update_empresa" ON public.pulse_contagens
  FOR UPDATE USING (empresa_id = public.meu_empresa_id());

DROP POLICY IF EXISTS "pulse_contagens_itens_select_empresa" ON public.pulse_contagens_itens;
DROP POLICY IF EXISTS "pulse_contagens_itens_insert_empresa" ON public.pulse_contagens_itens;
DROP POLICY IF EXISTS "pulse_contagens_itens_update_empresa" ON public.pulse_contagens_itens;
CREATE POLICY "pulse_contagens_itens_select_empresa" ON public.pulse_contagens_itens
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.pulse_contagens c WHERE c.id = contagem_id AND c.empresa_id = public.meu_empresa_id()));
CREATE POLICY "pulse_contagens_itens_insert_empresa" ON public.pulse_contagens_itens
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.pulse_contagens c WHERE c.id = contagem_id AND c.empresa_id = public.meu_empresa_id()));
CREATE POLICY "pulse_contagens_itens_update_empresa" ON public.pulse_contagens_itens
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.pulse_contagens c WHERE c.id = contagem_id AND c.empresa_id = public.meu_empresa_id()));

CREATE INDEX IF NOT EXISTS pulse_contagens_empresa_id_idx ON public.pulse_contagens(empresa_id);
CREATE INDEX IF NOT EXISTS pulse_contagens_itens_contagem_id_idx ON public.pulse_contagens_itens(contagem_id);

GRANT SELECT, INSERT, UPDATE ON public.pulse_contagens TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.pulse_contagens_itens TO authenticated, service_role;
