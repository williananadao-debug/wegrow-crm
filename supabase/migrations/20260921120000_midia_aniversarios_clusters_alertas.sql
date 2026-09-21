-- Alertas de aniversário de município por CLUSTER de atendimento do vendedor (Demais FM).
--  1) ano de emancipação (pra mostrar "completa N anos" no alerta);
--  2) vínculo vendedor ↔ cidades (cluster explícito; sem vínculo, vale a praça da unidade);
--  3) chave de deduplicação nas notificações (o cron diário não repete o mesmo aviso);
--  4) datas oficiais do "Anexo - aniver municípios" da Demais FM (corrige as que estavam
--     como placeholder dia 1 e as divergentes: Lontras, Salete, Rio do Campo, Rio do Oeste).

ALTER TABLE public.midia_aniversarios_municipios ADD COLUMN IF NOT EXISTS ano_emancipacao int;

CREATE TABLE IF NOT EXISTS public.midia_cluster_vendedor_cidades (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empresa_id     uuid        NOT NULL,
  vendedor_id    uuid        NOT NULL,
  aniversario_id bigint      NOT NULL REFERENCES public.midia_aniversarios_municipios(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, aniversario_id)
);

ALTER TABLE public.midia_cluster_vendedor_cidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "midia_cluster_select_empresa" ON public.midia_cluster_vendedor_cidades;
DROP POLICY IF EXISTS "midia_cluster_write_lideranca" ON public.midia_cluster_vendedor_cidades;
DROP POLICY IF EXISTS "midia_cluster_delete_lideranca" ON public.midia_cluster_vendedor_cidades;
CREATE POLICY "midia_cluster_select_empresa" ON public.midia_cluster_vendedor_cidades
  FOR SELECT USING (empresa_id = public.meu_empresa_id());
CREATE POLICY "midia_cluster_write_lideranca" ON public.midia_cluster_vendedor_cidades
  FOR INSERT WITH CHECK (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));
CREATE POLICY "midia_cluster_delete_lideranca" ON public.midia_cluster_vendedor_cidades
  FOR DELETE USING (empresa_id = public.meu_empresa_id() AND public.meu_cargo() IN ('diretor','gerente'));

CREATE INDEX IF NOT EXISTS midia_cluster_empresa_idx ON public.midia_cluster_vendedor_cidades(empresa_id);
CREATE INDEX IF NOT EXISTS midia_cluster_vendedor_idx ON public.midia_cluster_vendedor_cidades(vendedor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midia_cluster_vendedor_cidades TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Dedupe dos avisos gerados pelo cron (chave = aniv:<cidade>:<ano>:<faixa>)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS chave text;
-- Índice único SEM filtro (o upsert do PostgREST precisa inferir o índice); linhas com chave NULL
-- (avisos antigos) não colidem entre si, porque NULL é sempre distinto em índice único.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_chave_uniq ON public.notifications(user_id, chave);

-- Datas do anexo da Demais FM (dia, mês, idade completa em 2025 → ano de emancipação = 2025 − idade)
DO $anexo$
DECLARE
  v_emp uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_emp) THEN
    RAISE NOTICE 'Empresa Demais FM não encontrada — datas do anexo não aplicadas.';
    RETURN;
  END IF;

  UPDATE public.midia_aniversarios_municipios m
  SET dia = v.dia, mes = v.mes, ano_emancipacao = 2025 - v.idade,
      observacao = CASE WHEN m.observacao ILIKE '%não confirmado%' OR m.observacao IS NULL
                        THEN 'Data do anexo da Demais FM (conferir antes de ofertar).' ELSE m.observacao END
  FROM (VALUES
    ('Presidente Getúlio', 1, 6, 121), ('José Boiteux', 26, 4, 36), ('Ibirama', 11, 3, 91), ('Rio do Sul', 15, 4, 94),
    ('Dona Emma', 17, 5, 63), ('Apiúna', 1, 6, 36), ('Lontras', 31, 12, 63),
    ('Itaiópolis', 28, 10, 107), ('Mafra', 8, 9, 108), ('Rio Negrinho', 24, 4, 145), ('Papanduva', 11, 4, 71),
    ('Monte Castelo', 15, 5, 63), ('Major Vieira', 23, 1, 64), ('São Bento do Sul', 23, 9, 152),
    ('Santa Terezinha', 26, 9, 34), ('Campo Alegre', 18, 3, 128), ('Rio Negro', 15, 11, 154),
    ('Taió', 12, 2, 76), ('Pouso Redondo', 23, 7, 67), ('Salete', 29, 12, 64), ('Rio do Campo', 29, 12, 64),
    ('Mirim Doce', 26, 9, 34), ('Rio do Oeste', 23, 6, 67), ('Santa Cecília', 21, 6, 67),
    ('Braço do Trombudo', 26, 9, 34), ('Witmarsum', 15, 6, 63), ('Vitor Meireles', 26, 4, 36)
  ) AS v(municipio, dia, mes, idade)
  WHERE m.empresa_id = v_emp AND lower(m.municipio) = lower(v.municipio);
END $anexo$;
