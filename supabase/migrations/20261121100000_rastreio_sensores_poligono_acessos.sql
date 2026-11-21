-- Rastreio, parte 6 (21/11/2026) — primeiro rastreador real instalado (TEST003). O que faltava
-- da Anjia (referência):
-- 1) Sensores do aparelho no "estado atual" (satélites, sinal GSM, bateria interna, carregando)
--    e endereço da última posição (cache: só busca de novo se o veículo andou).
-- 2) Grupos de veículos (frotas PJ: "Entregas", "Diretoria"...).
-- 3) Cerca em polígono (além do círculo). lat/lng/raio_m continuam preenchidos (centro e raio
--    que envolve o polígono) para o filtro rápido; o teste fino usa os vértices.
-- 4) Acessos extras ao app do cliente (PJ: motorista/gestor), cada um com nome, veículos
--    permitidos e se pode bloquear. Sessões listáveis e revogáveis pelo painel.
-- 5) Relatório por e-mail para o cliente (semanal ou mensal).
-- Depende da 20261119160000 (resumo diário) — aplicar as duas juntas.

-- 1) Sensores + endereço
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS satelites integer;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS sinal_gsm integer;        -- 0 a 4 (GT06) ou 0-31/dBm conforme o aparelho
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS bateria_interna integer;  -- %
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS carregando boolean;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS endereco_lat double precision;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS endereco_lng double precision;

-- 2) Grupos
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS grupo text;
CREATE INDEX IF NOT EXISTS rastreio_veiculos_grupo_idx ON public.rastreio_veiculos(empresa_id, grupo) WHERE grupo IS NOT NULL;

-- 3) Cerca em polígono: [[lat,lng], ...]
ALTER TABLE public.rastreio_cercas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'circulo';
ALTER TABLE public.rastreio_cercas ADD COLUMN IF NOT EXISTS poligono jsonb;
ALTER TABLE public.rastreio_cercas DROP CONSTRAINT IF EXISTS rastreio_cercas_tipo_ck;
ALTER TABLE public.rastreio_cercas ADD CONSTRAINT rastreio_cercas_tipo_ck
  CHECK (tipo IN ('circulo', 'poligono') AND (tipo = 'circulo' OR jsonb_array_length(poligono) >= 3));
-- Polígono grande (bairro/cidade) pode envolver mais de 50 km.
ALTER TABLE public.rastreio_cercas DROP CONSTRAINT IF EXISTS rastreio_cercas_raio_m_check;
ALTER TABLE public.rastreio_cercas ADD CONSTRAINT rastreio_cercas_raio_m_check CHECK (raio_m BETWEEN 50 AND 500000);

-- 4) Acessos extras ao app (nulo = acesso do titular: todos os veículos e pode bloquear)
ALTER TABLE public.rastreio_app_convites ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.rastreio_app_convites ADD COLUMN IF NOT EXISTS veiculo_ids uuid[];
ALTER TABLE public.rastreio_app_convites ADD COLUMN IF NOT EXISTS pode_bloquear boolean NOT NULL DEFAULT true;
ALTER TABLE public.rastreio_app_sessoes  ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.rastreio_app_sessoes  ADD COLUMN IF NOT EXISTS veiculo_ids uuid[];
ALTER TABLE public.rastreio_app_sessoes  ADD COLUMN IF NOT EXISTS pode_bloquear boolean NOT NULL DEFAULT true;
ALTER TABLE public.rastreio_app_sessoes  ADD COLUMN IF NOT EXISTS dispositivo text;
ALTER TABLE public.rastreio_app_sessoes  ADD COLUMN IF NOT EXISTS revogado_em timestamptz;
-- Notificação segue a sessão: acesso extra só recebe alerta dos veículos dele; revogado para de receber.
ALTER TABLE public.rastreio_push_tokens  ADD COLUMN IF NOT EXISTS sessao_id bigint REFERENCES public.rastreio_app_sessoes(id) ON DELETE CASCADE;

-- 5) Relatório por e-mail
ALTER TABLE public.rastreio_clientes ADD COLUMN IF NOT EXISTS relatorio_email text
  CHECK (relatorio_email IS NULL OR relatorio_email IN ('semanal', 'mensal'));

NOTIFY pgrst, 'reload schema';
