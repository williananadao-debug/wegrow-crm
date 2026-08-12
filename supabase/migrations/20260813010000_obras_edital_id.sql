-- Ponte entre Argus (licitação) e Obras (execução): quando um edital vira
-- "ganho", o usuário pode criar a obra correspondente a partir dele (ver
-- src/app/argus/licitacoes/[id]/page.tsx). Precisa saber qual obra já veio
-- de qual edital pra não deixar criar duplicado nem perder o vínculo.
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS edital_id bigint REFERENCES public.argus_editais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS obras_edital_id_idx ON public.obras(edital_id);
