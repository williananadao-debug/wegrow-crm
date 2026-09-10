-- Cadastra o MODELO 4.1 PREMIUM da Trailer Travel com a especificação que o Will
-- colou no chat. Preço sob encomenda (estoque NULL — não guarda produto pronto parado,
-- cada unidade é fabricada quando vendida). Depois de rodar, falta só subir a foto pelo
-- painel: Configurações → Produtos → clica no quadrado da foto do produto.

INSERT INTO public.servicos (empresa_id, nome, preco, tipo, unidade, descricao)
SELECT
  e.id,
  'MODELO 4.1 PREMIUM',
  139900.00,
  'Trailer',
  'un',
  'Dimensões: 4,10 x 2,00 m

PARTE INTERNA
- Beliche de casal + cama infantil inferior
- Dinet que vira cama de solteiro
- Armário aéreo com LED
- Cozinha: frigobar duplex, cooktop, micro-ondas, cuba, torneira monocomando, armários
- Banheiro: box de vidro, ducha aquecida, cuba de vidro, armário, vaso marítimo de pedal

PARTE EXTERNA
- ACM aço escovado
- Cozinha externa com cooktop, cuba inox, torneira monocomando
- Toldo lateral
- Eixo simples + estepe
- Rodas de liga aro 15
- Aquecedor a gás
- Suspensão para 3.200 kg
- Freios por inércia
- Atuador para 2.500 kg
- Fechaduras e dobradiças em inox
- Assoalho em compensado naval 18 mm
- Piso vinílico'
FROM public.empresas e
WHERE e.nome ILIKE '%trailer%travel%'
  AND NOT EXISTS (
    SELECT 1 FROM public.servicos s WHERE s.empresa_id = e.id AND s.nome = 'MODELO 4.1 PREMIUM'
  );

-- Confere:
SELECT id, nome, preco, tipo, left(descricao, 60) AS inicio_descricao
FROM public.servicos
WHERE empresa_id IN (SELECT id FROM public.empresas WHERE nome ILIKE '%trailer%travel%')
  AND nome = 'MODELO 4.1 PREMIUM';
