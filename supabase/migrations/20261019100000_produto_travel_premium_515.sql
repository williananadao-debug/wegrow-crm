-- Cadastra (ou corrige, se já existir) o modelo "Premium 515" no catálogo da Trailer Travel,
-- em duas versões — com cavaleira e sem (apartamento maior) — pra fábrica, contrato e NF
-- saberem qual é sem depender de observação. Mesmo preço. Freio elétrico (+ R$ 12.900,00)
-- entra como adicional no configurador da venda. Dado, não schema — pode apagar depois.

DO $import$
DECLARE
  v_empresa_id uuid;
  v_base text := 'Dimensões: 5,15 x 2,20 x 2,00 m — valor R$ 155.000,00 (com freio elétrico: R$ 167.900,00)

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
- %EXTERNA%
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
- Potável: 150 L
- Dejetos: 100 L
- Servida: 100 L

Documentado e emplacado no nome do cliente. Produto sob encomenda — prazo de entrega aproximado de 250 a 280 dias após o fechamento do contrato e pagamento da entrada.';
  v_nome text;
  v_desc text;
BEGIN
  SELECT id INTO v_empresa_id FROM empresas WHERE nome ILIKE '%Trailer Travel%' LIMIT 1;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa Trailer Travel não encontrada em "empresas".';
  END IF;

  FOR v_nome, v_desc IN
    SELECT 'Premium 515 (com cavaleira)', replace(v_base, '%EXTERNA%', 'Cavaleira para 2 cavalos')
    UNION ALL
    SELECT 'Premium 515 (sem cavaleira)', replace(v_base, '%EXTERNA%', 'Sem cavaleira — apartamento maior')
  LOOP
    IF EXISTS (SELECT 1 FROM servicos WHERE empresa_id = v_empresa_id AND nome = v_nome) THEN
      UPDATE servicos SET descricao = v_desc, preco = 155000, prazo_fabricacao_dias = 280, ncm = '87161000'
      WHERE empresa_id = v_empresa_id AND nome = v_nome;
      RAISE NOTICE 'Produto "%" já existia — atualizado.', v_nome;
    ELSE
      -- unidade NULL = vende em todas as filiais; estoque NULL = sob encomenda (sem controle).
      INSERT INTO servicos (nome, preco, tipo, unidade, estoque, prazo_fabricacao_dias, descricao, ncm, empresa_id)
      VALUES (v_nome, 155000, 'Trailer sob encomenda', NULL, NULL, 280, v_desc, '87161000', v_empresa_id);
      RAISE NOTICE 'Produto "%" cadastrado.', v_nome;
    END IF;
  END LOOP;
END $import$;
