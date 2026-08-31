-- DETRAN/SC exige placa + renavam pra consulta de débitos e emissão de guia
-- (via Infosimples) — sem renavam essas duas integrações não funcionam pra SC.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS veiculo_renavam text;
