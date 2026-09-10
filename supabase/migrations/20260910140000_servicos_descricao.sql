-- Catálogo de produto até aqui não tinha campo pra especificação técnica longa (ex: lista
-- de itens de série de um modelo de trailer — "Beliche de casal + cama infantil inferior,
-- Cozinha com frigobar/cooktop/micro-ondas..."). Só nome + preço + imagem não é
-- suficiente pra vender algo tão customizável quanto um trailer sob medida.
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS descricao text;
