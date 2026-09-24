-- Mesmo problema da venda #3363 (ver 20260924170000): leads.itens[0].descricao da venda
-- #3316 (Vander Oliveira Jampaulo) guardou um SNAPSHOT antigo do produto "MODELO 4.1
-- PREMIUM" (servicos.id=226) de quando o cadastro dele ainda tinha, por engano, o contrato
-- inteiro colado na descrição (cabeçalho, cláusulas 1 a 11, dados do CONTRATANTE de OUTRO
-- cliente/venda) em vez de só as especificações técnicas. O cadastro do produto já está
-- limpo hoje; só o snapshot congelado dentro dessa venda ficou com a versão antiga.
-- jsonb_set troca só o campo "descricao" do item 0, sem tocar em servico/quantidade/preço.
UPDATE public.leads
SET itens = jsonb_set(itens, '{0,descricao}', to_jsonb($$Dimensões: 4,10 x 2,00 m — valor R$ 139.900,00

PARTE INTERNA
- Beliche de casal + cama infantil inferior
- Dinet que vira cama de solteiro
- Armário aéreo com LED
- Cozinha: frigobar duplex, cooktop, micro-ondas, cuba, torneira monocomando, armários
- Banheiro: box de vidro, ducha aquecida, cuba de vidro, armário, vaso marítimo de pedal

PARTE EXTERNA
- ACM aço escovado
- Cozinha externa com cooktop
- Cuba inox
- Torneira monocomando
- Toldo lateral
- Eixo simples + estepe
- Rodas de liga aro 15
- Aquecedor a gás
- Suspensão para 3.200 kg
- Freios por inércia
- Atuador para 2.500 kg
- Fechaduras e dobradiças em inox
- Assoalho em compensado naval 18 mm
- Piso vinílico
- Janelas + claraboia no banheiro

SISTEMA SOLAR
- Placa solar
- Inversor
- Bateria
- Controlador de carga

EQUIPAMENTOS
- Frigobar duplex 88 L
- Smart TV
- Ar-condicionado

CAPACIDADE DE ÁGUA
- Potável: 150 L / Dejetos: 70 L / Servida: 70 L

Documentado e emplacado no nome do cliente.
Prazo médio de entrega: 250 a 280 dias após assinatura do contrato.$$::text))
WHERE id = 3316;
