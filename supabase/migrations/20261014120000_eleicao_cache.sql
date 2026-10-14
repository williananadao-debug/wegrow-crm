-- Cache da apuração do TSE para o painel público /eleicao (2º turno 2026).
-- Uma linha por modo ('real' = 2º turno, 'teste' = dados do 1º turno). O servidor baixa
-- do TSE só os municípios que mudaram e grava o estado agregado aqui, pra que todas as
-- instâncias da função (e todas as telas: TV da rádio, celulares) vejam o mesmo número
-- sem cada uma refazer a varredura de 5.570 municípios.
-- trava_ate = lock simples: só uma instância atualiza por vez.
CREATE TABLE IF NOT EXISTS public.eleicao_cache (
  chave         text PRIMARY KEY,
  dados         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  trava_ate     timestamptz NOT NULL DEFAULT 'epoch'
);

-- Sem policies: só a service role (rotas /api/eleicao) lê e escreve.
ALTER TABLE public.eleicao_cache ENABLE ROW LEVEL SECURITY;

INSERT INTO public.eleicao_cache (chave) VALUES ('real'), ('teste')
ON CONFLICT (chave) DO NOTHING;
