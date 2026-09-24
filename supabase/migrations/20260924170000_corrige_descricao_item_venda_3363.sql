-- A venda #3363 (Maiko, Trailer Travel) guardou, em leads.itens[0].descricao, um SNAPSHOT
-- tirado no momento da venda — e naquele momento o produto "TRAVEL SILVER HOUSE 565"
-- (servicos.id=227) ainda tinha, por engano, o contrato inteiro da empresa colado no campo
-- de descrição (cabeçalho, cláusulas 1 a 12, tabela de parcelas com tabs) em vez de só a
-- lista de especificações técnicas. O cadastro do produto já foi corrigido depois (está
-- limpo hoje), mas o snapshot dentro dessa venda ficou congelado com a versão antiga —
-- daí o contrato gerado pra essa venda specific continuar saindo com cláusulas duplicadas
-- e texto malformatado (bullets/tabs que o gerador de PDF não trata bem).
-- jsonb_set troca só o campo "descricao" do item 0, sem tocar em servico/quantidade/preço.
UPDATE public.leads
SET itens = jsonb_set(itens, '{0,descricao}', to_jsonb($$Dimensões: 5,65 x 2,20 x 2,00 m — valor R$ 169.900,00 (com freio elétrico: R$ 189.900,00, ver variante)

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
Prazo de entrega aproximado: 250 a 280 dias após fechamento do contrato e pagamento da entrada.$$::text))
WHERE id = 3363;
