-- Captura automática de andamentos processuais — maior diferencial de sistemas como
-- Astrea/CPJ ("push de movimentação processual"). Usa a API Pública do DataJud (CNJ),
-- gratuita e sem conta própria — diferente da integração de FIPE/DETRAN, aqui não há
-- provedor pago nem credencial da empresa envolvida, só uma chave pública compartilhada
-- publicada pelo próprio CNJ (ver datajud-wiki.cnj.jus.br/api-publica/acesso).

ALTER TABLE public.advocacia_processos ADD COLUMN IF NOT EXISTS tribunal text;
ALTER TABLE public.advocacia_processos ADD COLUMN IF NOT EXISTS ultima_sincronizacao timestamptz;

CREATE TABLE IF NOT EXISTS public.advocacia_andamentos (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id    uuid        NOT NULL,
  processo_id   bigint      NOT NULL REFERENCES public.advocacia_processos(id) ON DELETE CASCADE,
  codigo        int,
  nome          text        NOT NULL,
  data_hora     timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id, codigo, data_hora)
);

ALTER TABLE public.advocacia_andamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advocacia_andamentos_select_empresa" ON public.advocacia_andamentos;
DROP POLICY IF EXISTS "advocacia_andamentos_insert_empresa" ON public.advocacia_andamentos;

CREATE POLICY "advocacia_andamentos_select_empresa" ON public.advocacia_andamentos
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "advocacia_andamentos_insert_empresa" ON public.advocacia_andamentos
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id());

CREATE INDEX IF NOT EXISTS advocacia_andamentos_processo_id_idx ON public.advocacia_andamentos(processo_id);

GRANT SELECT, INSERT ON public.advocacia_andamentos TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
