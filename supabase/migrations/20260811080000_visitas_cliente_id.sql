-- Liga a visita ao cliente real (antes só existia o texto livre visitas.empresa).
-- Pré-requisito pra calcular "dias sem visita" por cliente e pra amarrar
-- automaticamente uma visita registrada à parada de uma Rota do Dia.
ALTER TABLE public.visitas ADD COLUMN IF NOT EXISTS cliente_id BIGINT REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS visitas_cliente_id_idx ON public.visitas(cliente_id);
