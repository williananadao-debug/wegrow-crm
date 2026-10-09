-- Foto da produção só vai pro Portal do Cliente depois de aprovada pela gestão (diretor/gerente).
-- foto_status: null/'pendente' = aguardando, 'aprovada' = aparece no portal, 'recusada' = nunca aparece.
ALTER TABLE public.pulse_producao_eventos ADD COLUMN IF NOT EXISTS foto_status text
  CHECK (foto_status IS NULL OR foto_status IN ('pendente', 'aprovada', 'recusada'));
ALTER TABLE public.pulse_producao_eventos ADD COLUMN IF NOT EXISTS foto_avaliada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.pulse_producao_eventos ADD COLUMN IF NOT EXISTS foto_avaliada_em timestamptz;

CREATE INDEX IF NOT EXISTS pulse_producao_eventos_fotos_pendentes_idx
  ON public.pulse_producao_eventos (producao_id) WHERE foto_url IS NOT NULL AND (foto_status IS NULL OR foto_status = 'pendente');
