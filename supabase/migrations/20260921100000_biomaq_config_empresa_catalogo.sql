-- Configura a empresa BIOMAQ (fábrica de fornalhas/queimadores a cavaco) com CRM + Pulse:
-- venda nasce no funil (CRM), estoque/produção seguem o Pulse. É DADO, não schema —
-- pode apagar este arquivo depois de rodar. Idempotente (rodar 2x não duplica produto).
-- As imagens vêm de /public/biomaq/*.png (extraídas do catálogo 2026).
--
-- PREÇOS: os de fornalha e conversão são valores de REFERÊNCIA citados pelo Heitor
-- (fornalha ~R$ 300 mil; conversão/automação ~R$ 390 mil no exemplo Nova Aliança).
-- Queimador, alimentação e periféricos ficam em 0 de propósito: o vendedor informa o valor
-- na proposta (dimensionamento varia por cliente).

DO $biomaq$
DECLARE
  v_empresa uuid := 'dc3c3320-f652-4289-ae91-eab23ef956f2';
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = v_empresa) THEN
    RAISE EXCEPTION 'Empresa % não encontrada.', v_empresa;
  END IF;

  -- Módulos: CRM (venda) + Pulse (estoque/produção/fiscal). Etapas de produção da fábrica,
  -- ~85 dias no total (Heitor: "uns 90 dias pra fabricar").
  UPDATE empresas SET modulos = coalesce(modulos, '{}'::jsonb) || jsonb_build_object(
    'crm', true,
    'pulse', true,
    'pulse_etapas_fabricacao', jsonb_build_array(
      jsonb_build_object('nome', 'Engenharia / Projeto', 'prazoDias', 10),
      jsonb_build_object('nome', 'Corte e Dobra', 'prazoDias', 10),
      jsonb_build_object('nome', 'Solda / Estrutura', 'prazoDias', 20),
      jsonb_build_object('nome', 'Pintura', 'prazoDias', 7),
      jsonb_build_object('nome', 'Montagem Mecânica', 'prazoDias', 20),
      jsonb_build_object('nome', 'Elétrica e Automação', 'prazoDias', 15),
      jsonb_build_object('nome', 'Expedição', 'prazoDias', 3)
    )
  ) WHERE id = v_empresa;

  FOR r IN SELECT * FROM (VALUES
    ('Fornalha a Cavaco (gerador de gases quentes)', 300000, 'Equipamento', 90, '/biomaq/fornalha.png',
E'Gerador de gases quentes a cavaco para secagem de grãos, cereais, fertilizantes, minérios e biomassa.\n\nCAPACIDADE\n- 400.000 kcal/h até 25.000.000 kcal/h (informar a capacidade na proposta)\n- Temperatura de combustão de 650 a 1200 °C (conforme o PCI)\n\nDIFERENCIAIS\n- Queima de combustíveis com até 55% de umidade\n- Economia de até 40% no consumo de combustível\n- Combustão completa: até 98% de eficiência\n- Redução de até 50% de mão de obra operacional\n- Automação e supervisão (IHM ou supervisório)\n\nValor de referência — dimensionar conforme secador e combustível do cliente.'),
    ('Sistema de Conversão — Grelha Móvel p/ Fornalha de Alvenaria', 390000, 'Equipamento', 90, '/biomaq/conversao-grelha-movel.png',
E'Converte fornalha de alvenaria a lenha existente em sistema automatizado de queima de biomassa (cavaco).\n\nCAPACIDADE\n- 400.000 kcal/h até 12.000.000 kcal/h\n\nVANTAGENS\n- Baixo investimento de transição e rápido retorno\n- Automatiza o processo e reduz o custo operacional\n- Economia de combustível e menor tempo de secagem\n\nValor de referência (exemplo de projeto) — ajustar conforme layout e capacidade levantados pela engenharia.'),
    ('Queimador Seco / Refrigerado p/ Caldeira', 0, 'Equipamento', 90, '/biomaq/queimador.png',
E'Queimador de biomassa (tipo seco ou refrigerado) acoplado a caldeiras a lenha ou gás.\n\nCAPACIDADE\n- 400.000 kcal/h até 25.000.000 kcal/h\n\nDIFERENCIAIS\n- Converte a fonte energética (lenha/gás) para biomassa picada\n- Menos paradas para limpeza e menor consumo de combustível\n- Possibilidade de ampliar a vazão de vapor mediante estudo de engenharia\n\nValor conforme dimensionamento.'),
    ('Sistema de Alimentação de Biomassa', 0, 'Equipamento', 60, '/biomaq/alimentacao.png',
E'Solução integrada de recepção, classificação, dosagem e movimentação de biomassa, customizada ao layout do cliente.\n\nRECEPÇÃO\n- Moega com roscas ou com fundos móveis\n\nCLASSIFICAÇÃO\n- Peneira de discos e peneiras de finos\n\nDOSAGEM\n- Silo dosador com roscas ou de fundo móvel\n\nMOVIMENTAÇÃO\n- Transportador de correia (arraste ou treliçado), elevador de canecas, roscas transportadoras e redler\n\nValor conforme layout e combustível.'),
    ('Filtro Multiciclone', 0, 'Periférico', 30, '/biomaq/multiciclone.png', E'Periférico — informar tamanho/modelo e valor na proposta.'),
    ('Transportador de Correia', 0, 'Periférico', 30, '/biomaq/transportador-correia.png', E'Periférico — informar tamanho/modelo e valor na proposta.'),
    ('Pré-aquecedor de Ar', 0, 'Periférico', 30, '/biomaq/pre-aquecedor-ar.png', E'Periférico — informar tamanho/modelo e valor na proposta.'),
    ('Economizador', 0, 'Periférico', 30, '/biomaq/economizador.png', E'Periférico — informar tamanho (ex: 25) e valor na proposta.'),
    ('Ventilador', 0, 'Periférico', 30, '/biomaq/ventilador.png', E'Periférico — informar tamanho/modelo e valor na proposta.'),
    ('Chaminé', 0, 'Periférico', 30, '/biomaq/chamine.png', E'Periférico — informar altura/diâmetro e valor na proposta.'),
    ('Grelhas', 0, 'Periférico', 30, '/biomaq/grelhas.png', E'Peça de reposição — informar modelo e valor na proposta.'),
    ('Tanque de Descarga', 0, 'Periférico', 30, '/biomaq/tanque-descarga.png', E'Periférico — informar tamanho e valor na proposta.'),
    ('Peneira de Disco', 0, 'Periférico', 30, '/biomaq/peneira-disco.png', E'Periférico — informar tamanho e valor na proposta.'),
    ('Refratários', 0, 'Periférico', 15, '/biomaq/refratarios.png', E'Refratário — informar tipo (mais/menos alumínio, conforme combustível) e valor na proposta.'),
    ('Dutos de Ar', 0, 'Periférico', 30, '/biomaq/dutos-ar.png', E'Periférico — informar dimensões e valor na proposta.'),
    ('Grelha Fixa Refrigerada', 0, 'Periférico', 30, '/biomaq/grelha-fixa-refrigerada.png', E'Periférico — informar tamanho e valor na proposta.'),
    ('Fundo Móvel', 0, 'Periférico', 30, '/biomaq/fundos-moveis.png', E'Periférico — informar tamanho e valor na proposta.'),
    ('Silo Dosador com Fundo Móvel', 0, 'Periférico', 30, '/biomaq/silo-dosador-fundo-movel.png', E'Periférico — informar capacidade e valor na proposta.'),
    ('Silo Dosador com Roscas', 0, 'Periférico', 30, '/biomaq/silo-dosador-roscas.png', E'Periférico — informar capacidade e valor na proposta.'),
    ('Válvula Rotativa', 0, 'Periférico', 30, '/biomaq/valvula-rotativa.png', E'Periférico — informar modelo e valor na proposta.'),
    ('Rosca Helicoidal', 0, 'Periférico', 30, '/biomaq/rosca-helicoidal.png', E'Periférico — informar comprimento/diâmetro e valor na proposta.'),
    ('Reforma Geral de Caldeira', 0, 'Periférico', 45, '/biomaq/reforma-caldeiras.png', E'Reforma e manutenção de caldeiras — escopo e valor conforme inspeção técnica.')
  ) AS t(nome, preco, tipo, prazo, img, descr)
  LOOP
    IF EXISTS (SELECT 1 FROM servicos WHERE empresa_id = v_empresa AND nome = r.nome) THEN
      UPDATE servicos SET tipo = r.tipo, prazo_fabricacao_dias = r.prazo, imagem_url = r.img, descricao = r.descr
      WHERE empresa_id = v_empresa AND nome = r.nome;
    ELSE
      INSERT INTO servicos (nome, preco, tipo, unidade, estoque, prazo_fabricacao_dias, descricao, imagem_url, empresa_id)
      VALUES (r.nome, r.preco, r.tipo, NULL, NULL, r.prazo, r.descr, r.img, v_empresa);
    END IF;
  END LOOP;
END $biomaq$;
