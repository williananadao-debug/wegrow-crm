-- Rastreio, parte 3 (19/11/2026):
-- 1) Cercas virtuais (círculo): alerta quando o veículo entra/sai. "dentro" guarda o último
--    estado para só avisar na troca (o webhook do Traccar calcula, sem depender do Traccar).
-- 2) Link de localização ao vivo com validade (painel ou app do cliente compartilham com
--    família/polícia/seguradora). Só o hash do token fica no banco; leitura só pelo servidor.

CREATE TABLE IF NOT EXISTS public.rastreio_cercas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL,
  veiculo_id  uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  raio_m      integer     NOT NULL CHECK (raio_m BETWEEN 50 AND 50000),
  ativo       boolean     NOT NULL DEFAULT true,
  dentro      boolean,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_cercas_veiculo_idx ON public.rastreio_cercas(veiculo_id) WHERE ativo;

ALTER TABLE public.rastreio_cercas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rastreio_cercas_empresa" ON public.rastreio_cercas;
CREATE POLICY "rastreio_cercas_empresa" ON public.rastreio_cercas
  FOR ALL USING (empresa_id = (SELECT public.meu_empresa_id()))
  WITH CHECK (empresa_id = (SELECT public.meu_empresa_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_cercas TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.rastreio_compartilhamentos (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id  uuid        NOT NULL,
  veiculo_id  uuid        NOT NULL REFERENCES public.rastreio_veiculos(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  criado_por  text,
  origem      text        NOT NULL DEFAULT 'painel',
  revogado_em timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rastreio_compartilhamentos_veiculo_idx ON public.rastreio_compartilhamentos(veiculo_id);

-- Sem policy: só o servidor (service role) lê/grava.
ALTER TABLE public.rastreio_compartilhamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreio_compartilhamentos TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';
