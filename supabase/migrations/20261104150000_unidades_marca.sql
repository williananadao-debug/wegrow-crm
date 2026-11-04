-- Marca por unidade: redes com várias emissoras (ex.: Grupo RBV, 9 rádios) têm logo e cor
-- próprias em cada uma. Cadastro no God Mode → Unidades; o contrato da emissora usa os dois
-- quando ela não tem timbrado próprio.
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS cor text;

NOTIFY pgrst, 'reload schema';
