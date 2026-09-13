-- Cadastra DIAMOND HOUSE 7.5 e TRAVEL SILVER HOUSE 565 (com a variante "Com Freio
-- Elétrico") da Trailer Travel. prazo_fabricacao_dias = 270 (meio do "250 a 280 dias"
-- informado) — mesmo campo usado pela previsão de entrega em Nova Venda e pela seção
-- "Reposição inteligente" do estoque. Falta só a foto: Configurações → Produtos → clica
-- no quadrado da foto de cada um.

INSERT INTO public.servicos (empresa_id, nome, preco, tipo, unidade, descricao, prazo_fabricacao_dias)
SELECT
  e.id,
  'DIAMOND HOUSE 7.5',
  195900.00,
  'Trailer',
  '', -- unidade = filial/unidade de negócio, não unidade de medida — '' = "Geral", visível pra empresa inteira
  'Dimensões: 7,50 x 2,20 m — valor a partir de R$ 195.900,00 (varia por personalização)

CONFIGURAÇÃO
- Freios elétricos importados
- Cambão importado
- Rodas de liga com pneus AT
- Suspensão reforçada
- Eixos de 75 mm

ÁREA INTERNA
- Beliche com colchão
- Cama de casal com colchão
- Frigobar duplex
- Ar-condicionado
- Iluminação em LED com sancas

BANHEIRO
- Amplo com claraboia
- Cuba em PVC
- Box de vidro
- Aquecimento a gás
- Vaso marítimo com pedal lateral

ÁREA EXTERNA
- Cozinha externa
- Cervejeira
- Toldos laterais

TRANSPORTE
- Capacidade para 2 animais
- Rampa de acesso à cavaleira

SISTEMA
- Energia solar

Documentado no nome do cliente.
Produto sob encomenda — prazo médio de entrega: 250 a 280 dias após assinatura do contrato.',
  270
FROM public.empresas e
WHERE e.nome ILIKE '%trailer%travel%'
  AND NOT EXISTS (SELECT 1 FROM public.servicos s WHERE s.empresa_id = e.id AND s.nome = 'DIAMOND HOUSE 7.5');

WITH pai AS (
  INSERT INTO public.servicos (empresa_id, nome, preco, tipo, unidade, descricao, prazo_fabricacao_dias)
  SELECT
    e.id,
    'TRAVEL SILVER HOUSE 565',
    169900.00,
    'Trailer',
    '',
    'Dimensões: 5,65 x 2,20 x 2,00 m — valor R$ 169.900,00 (com freio elétrico: R$ 189.900,00, ver variante)

MONTAGEM INTERNA
- Teto com sanca, LED e plafon
- Pia com cuba inox
- Torneira monocomando aquecida
- Beliche de casal com colchão
- Ar-condicionado
- Cooktop
- Frigobar
- Banheiro completo: armário, cuba, torneira monocomando, espelho, ducha aquecida, claraboia, box, vaso marítimo de pedal

MONTAGEM EXTERNA
- Cavaleira para 2 cavalos
- Cozinha externa
- Bagageiro externo com TV
- Toldo lateral
- Rodas de liga aro 15 com pneus
- Suspensão para 3.200 kg
- Freios por inércia nas 4 rodas
- Atuador para 2.500 kg
- Acabamentos em alumínio lavrado
- Fechaduras e dobradiças em inox
- Assoalho em compensado naval 18 mm

SISTEMAS
- Sistema completo de placa solar
- Aquecedor a gás
- Instalação elétrica padrão
- Instalação hidráulica em PEX

CAPACIDADE DE ÁGUA
- Potável: 250 L / Dejetos: 100 L / Servida: 100 L

Documentado e emplacado no nome do cliente.
Prazo de entrega aproximado: 250 a 280 dias após fechamento do contrato e pagamento da entrada.',
    270
  FROM public.empresas e
  WHERE e.nome ILIKE '%trailer%travel%'
    AND NOT EXISTS (SELECT 1 FROM public.servicos s WHERE s.empresa_id = e.id AND s.nome = 'TRAVEL SILVER HOUSE 565')
  RETURNING id, empresa_id
)
INSERT INTO public.servicos (empresa_id, nome, preco, tipo, unidade, produto_pai_id, variante_nome, prazo_fabricacao_dias)
SELECT empresa_id, 'TRAVEL SILVER HOUSE 565', 189900.00, 'Trailer', '', id, 'Com Freio Elétrico', 270
FROM pai;

-- Confere:
SELECT id, nome, preco, produto_pai_id, variante_nome, prazo_fabricacao_dias, left(descricao, 50) AS inicio_descricao
FROM public.servicos
WHERE empresa_id IN (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
  AND nome IN ('DIAMOND HOUSE 7.5', 'TRAVEL SILVER HOUSE 565')
ORDER BY nome, produto_pai_id NULLS FIRST;
