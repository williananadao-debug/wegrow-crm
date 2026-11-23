-- Ignição virtual (23/11/2026): carros de partida por botão (luxo/keyless) não têm o fio de pós-chave
-- para o rastreador ler. Marcado no veículo, o sistema considera "ligado" quando ele anda e
-- "desligado" depois de alguns minutos parado (lib/rastreio.ts → ignicaoVirtual).
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS ignicao_virtual boolean NOT NULL DEFAULT false;
ALTER TABLE public.rastreio_veiculos ADD COLUMN IF NOT EXISTS ultimo_movimento_em timestamptz;
NOTIFY pgrst, 'reload schema';
