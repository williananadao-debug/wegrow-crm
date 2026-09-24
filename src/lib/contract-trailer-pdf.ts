import PDFDocument from 'pdfkit';

// Texto das cláusulas segue o contrato real que a Trailer Travel já usa e já assinou com
// clientes (o mesmo modelo enviado pela empresa, usado nas vendas do Alex Simões Franco e
// da Thirty Marketing Solutions em 27-28/08/2026) — não é mais um rascunho genérico.
// Única diferença deliberada: a cláusula de validade de assinatura eletrônica no fim, que
// o contrato original não tinha (eles assinam por certificado ICP-Brasil via gov.br) mas
// que é necessária aqui porque a assinatura é feita pelo DocuSeal.
// Estrutura de geração de PDF (header/rodapé/paginação) copiada de contract-radio-pdf.ts.

export type ItemContratoTrailer = {
  servico: string; quantidade: number; precoUnitario: number; descricao?: string | null;
};

export type ContratoTrailerData = {
  protocolo: string;
  vendedora_razao: string;
  vendedora_endereco: string;
  vendedora_cnpj: string;
  vendedora_nome: string;
  vendedora_cidade?: string;
  vendedora_estado?: string;
  cliente: string;
  cliente_razao_social?: string;
  cnpj: string;
  endereco?: string;
  telefone: string;
  cidade: string;
  itens: ItemContratoTrailer[];
  desconto: number;
  valor_total: number;
  parcelas: string;
  vencimento: string;
  vencimentos_datas?: string[];
  forma_pagamento?: string;
  // Entrada opcional, paga separado do saldo parcelado (ex: 30% via boleto no fechamento,
  // saldo em 8x). Sem valor_entrada, o contrato imprime só a seção de parcelas de sempre.
  valor_entrada?: number;
  forma_pagamento_entrada?: string;
  // Carnê com valor/data próprios por parcela (ex: entrada + 5 parcelas iguais + 1 parcela
  // final maior) — quando presente, substitui o cálculo de "parcelas iguais" abaixo.
  parcelas_detalhe?: { data: string; valor: number }[];
  prazoFabricacaoDias: number | null;
  observacao?: string;
  // Logo da empresa (bytes já baixados de empresas.logo_url pelo caller — pdfkit não aceita
  // URL direto em doc.image, só Buffer/path local) — opcional; sem ela, contrato sai sem
  // timbrado, como sempre saiu (não é regressão, é a mesma ausência de recurso de antes).
  logoBuffer?: Buffer;
  // Cor de marca da empresa (empresas.cor_primaria, mesma usada no resto do app) — pinta a
  // faixa/onda do rodapé. Sem valor, cai no verde padrão do sistema (AuthContext usa o mesmo fallback).
  corPrimaria?: string;
};

const FORMAS_PAGAMENTO: Record<string, string> = {
  boleto: 'Boleto', dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', transferencia: 'Transferência',
  financiamento: 'Financiamento bancário', consorcio: 'Consórcio', cheque: 'Cheque', permuta: 'Permuta/Troca',
};

// Texto vindo do banco (descrição de produto, observação) pode ter "\r\n" em vez de só "\n"
// — aconteceu de verdade numa migration desta empresa: o Git no Windows (core.autocrlf=true)
// converteu as quebras de linha do arquivo .sql pra CRLF, e o "\r" foi parar dentro do texto
// gravado no banco. O pdfkit não tem glyph pra "\r" nas fontes padrão (Helvetica/WinAnsi) e
// renderiza um caractere de substituição (aparecia como "Ð" no PDF) em vez de simplesmente
// pular a linha. Normaliza antes de imprimir qualquer texto livre, não só o que veio dessa
// migration específica — protege contra qualquer fonte futura do mesmo problema.
function normalizarTexto(t: string) {
  return t.replace(/\r\n?/g, '\n');
}
function fmt(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
function fmtData(d: string) {
  if (!d) return '___/___/______';
  try { return new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR'); } catch { return d; }
}
function somarMeses(dataIso: string, meses: number) {
  const [y, m, d] = dataIso.split('-').map(Number);
  const dt = new Date(y, m - 1 + meses, d);
  if (dt.getDate() !== d) dt.setDate(0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function fmtVencimentos(vencimento: string, parcelas: string, vencimentosDatas?: string[]) {
  const qtd = Math.max(1, parseInt(parcelas, 10) || 1);
  if (Array.isArray(vencimentosDatas) && vencimentosDatas.length === qtd) return vencimentosDatas.map(fmtData).join(',          ');
  if (!vencimento) return fmtData('');
  return Array.from({ length: qtd }, (_, i) => fmtData(somarMeses(vencimento, i))).join(',          ');
}
export type ContratoTrailerBufferResult = { buffer: Buffer; sigPage: number; sigYFrac: number };

export function gerarContratoTrailerBuffer(data: ContratoTrailerData): Promise<ContratoTrailerBufferResult> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 80, left: 50, right: 50 },
        bufferPages: true,
        info: { Title: `Contrato de Venda — ${data.cliente}` },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);

      const corTitulo = '#111111';
      const corMarca = /^#[0-9a-fA-F]{6}$/.test(data.corPrimaria || '') ? data.corPrimaria! : '#22C55E';

      // ── TIMBRADO (logo no topo + onda colorida no rodapé, em toda página) ──────────────
      // Mesma ideia do timbrado do contrato de rádio (contract-radio-pdf.ts, PNG pronto por
      // emissora), mas montado na hora com o que a própria empresa já cadastra em Admin
      // (logo + cor de marca) — funciona pra qualquer empresa do Pulse, não só uma unidade.
      // Primeira versão colocava a logo grande e translúcida no MEIO da página — sobrepondo
      // o corpo do texto e deixando ilegível quando havia bastante conteúdo (relatado pelo
      // usuário). Trocado por um cabeçalho com a logo centralizada no topo (fora da área de
      // texto) + uma onda na cor de marca no rodapé, do jeito que o timbrado da rádio já faz.
      const desenharCabecalho = () => {
        if (!data.logoBuffer) return;
        try {
          doc.image(data.logoBuffer, (doc.page.width - 160) / 2, 22, { fit: [160, 50], align: 'center', valign: 'center' });
        } catch { /* segue sem logo se o buffer não for uma imagem válida */ }
      };
      const desenharRodape = () => {
        const H = doc.page.height, W = doc.page.width;
        doc.save();
        doc.moveTo(0, H - 18)
          .bezierCurveTo(W * 0.25, H - 42, W * 0.45, H - 4, W * 0.7, H - 24)
          .bezierCurveTo(W * 0.85, H - 34, W * 0.95, H - 8, W, H - 20)
          .lineTo(W, H).lineTo(0, H).closePath()
          .fillColor(corMarca).fill();
        doc.restore();
      };
      desenharCabecalho();
      let paginaAtual = 1;
      doc.on('pageAdded', () => { paginaAtual++; desenharCabecalho(); });
      if (data.logoBuffer) doc.y = 85; // desce o início do texto pra não sobrepor a logo do cabeçalho

      // ── HEADER ──────────────────────────────────────────────────
      doc.fontSize(16).font('Helvetica-Bold').fillColor(corTitulo)
        .text('CONTRATO PARTICULAR DE COMPRA E FABRICAÇÃO DE TRAILER SOB ENCOMENDA', { align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor('#555')
        .text(`${data.vendedora_nome}  ·  Protocolo #${data.protocolo}`, { align: 'center' });
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(0.8);

      // ── INTRO / PARTES ───────────────────────────────────────────
      doc.fontSize(8).font('Helvetica').fillColor('#000');
      const localVendedora = data.vendedora_cidade
        ? `, com sede na cidade de ${data.vendedora_cidade}${data.vendedora_estado ? `/${data.vendedora_estado}` : ''}`
        : '';
      doc.text('Pelo presente instrumento particular, de um lado: ', { continued: true })
        .font('Helvetica-Bold').text('CONTRATADA: ', { continued: true })
        .font('Helvetica').text(
          `${data.vendedora_razao}, pessoa jurídica de direito privado, inscrita no CNPJ nº ${data.vendedora_cnpj || '___'}${localVendedora}, neste ato representada por sua representante legal, doravante denominada simplesmente CONTRATADA;`,
          { align: 'justify' }
        );
      doc.moveDown(0.6);
      doc.text('e, de outro lado:', { align: 'justify' });
      doc.moveDown(0.4);

      const linha = (label: string, valor: string) => {
        doc.font('Helvetica-Bold').fontSize(8).text(label, 50, doc.y, { continued: true })
          .font('Helvetica').text(valor || '___________________________');
      };
      doc.font('Helvetica-Bold').fontSize(8).text('CONTRATANTE: ', 50, doc.y);
      linha('Nome/Razão Social: ', (data.cliente_razao_social || data.cliente).toUpperCase());
      const y1 = doc.y;
      doc.font('Helvetica-Bold').text('CPF/CNPJ: ', 50, y1, { continued: true, width: 240 })
        .font('Helvetica').text(data.cnpj || '___________________________');
      doc.font('Helvetica-Bold').text('Telefone: ', 300, y1, { continued: true })
        .font('Helvetica').text(data.telefone || '_______________');
      const y2 = Math.max(doc.y, y1 + 14);
      doc.font('Helvetica-Bold').text('Endereço: ', 50, y2, { continued: true, width: 490 })
        .font('Helvetica').text(data.endereco || '___________________________');
      doc.x = 50;
      doc.y = Math.max(doc.y, y2 + 14);
      doc.moveDown(0.6);

      doc.font('Helvetica').fontSize(8).fillColor('#000')
        .text('Têm entre si justo e contratado o presente Contrato Particular de Compra e Fabricação de Trailer Sob Encomenda, doravante simplesmente CONTRATANTE, mediante as cláusulas e condições seguintes.', { align: 'justify' });
      doc.moveDown(0.8);

      const clausula = (n: string, titulo: string) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text(`CLÁUSULA ${n} – ${titulo}`);
        doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
        doc.moveDown(0.4);
      };

      // ── 1ª – DO OBJETO ──────────────────────────────────────────────
      clausula('1ª', 'DO OBJETO');
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      const totalUnidades = data.itens.reduce((s, i) => s + i.quantidade, 0);
      doc.text(
        `O presente contrato tem por objeto a fabricação, montagem, venda, documentação e entrega de ${totalUnidades} (${totalUnidades === 1 ? 'um' : totalUnidades}) trailer(s) produzido(s) sob encomenda pela CONTRATADA, conforme as características e especificações estabelecidas neste instrumento.`,
        { align: 'justify' }
      );
      doc.moveDown(0.3);
      for (const item of data.itens) {
        doc.font('Helvetica-Bold').fontSize(8).text(`Modelo: ${item.servico}${item.quantidade > 1 ? ` (${item.quantidade} unidades)` : ''}`);
      }
      doc.font('Helvetica-Bold').fontSize(8).text(`Valor: ${fmt(data.valor_total)}`);
      doc.moveDown(0.6);

      // ── 2ª – DAS ESPECIFICAÇÕES DO TRAILER ───────────────────────────
      clausula('2ª', 'DAS ESPECIFICAÇÕES DO TRAILER');
      doc.font('Helvetica').fontSize(8).fillColor('#000')
        .text('O trailer será fabricado contemplando os seguintes itens e características:', { align: 'justify' });
      doc.moveDown(0.3);
      for (const item of data.itens) {
        if (item.descricao) {
          doc.font('Helvetica').fontSize(7.5).fillColor('#333').text(normalizarTexto(item.descricao), { align: 'left' });
          doc.fillColor('#000').fontSize(8);
          doc.moveDown(0.3);
        }
      }
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'O trailer será entregue documentado e emplacado em nome do CONTRATANTE, observadas as exigências e procedimentos dos órgãos competentes.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── 3ª – DO VALOR E DA FORMA DE PAGAMENTO ─────────────────────────
      clausula('3ª', 'DO VALOR E DA FORMA DE PAGAMENTO');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        `O valor total ajustado para fabricação e fornecimento do(s) trailer(s) objeto deste contrato é de ${fmt(data.valor_total)}.`,
        { align: 'justify' }
      );
      doc.moveDown(0.3);
      const subtotal = data.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
      if (data.desconto > 0) {
        linha('Subtotal: ', fmt(subtotal));
        linha('Desconto: ', `- ${fmt(data.desconto)}`);
      }
      if (data.valor_entrada && data.valor_entrada > 0) {
        linha('Entrada: ', fmt(data.valor_entrada) + (data.forma_pagamento_entrada ? ` — ${FORMAS_PAGAMENTO[data.forma_pagamento_entrada] || data.forma_pagamento_entrada}` : ''));
        linha('Saldo: ', fmt(Math.max(0, data.valor_total - data.valor_entrada)));
      }
      if (Array.isArray(data.parcelas_detalhe) && data.parcelas_detalhe.length > 0) {
        // Carnê — cada parcela com seu valor e vencimento (não necessariamente iguais).
        data.parcelas_detalhe.forEach((p, i) => {
          linha(`Parcela ${i + 1}/${data.parcelas_detalhe!.length} — ${fmtData(p.data)}: `, fmt(p.valor));
        });
      } else {
        linha('Parcela(s): ', data.parcelas || '1');
        linha('Vencimento(s): ', fmtVencimentos(data.vencimento, data.parcelas || '1', data.vencimentos_datas));
        if (data.valor_total > 0) {
          const qtdParcelasPagamento = Math.max(1, parseInt(data.parcelas || '1', 10) || 1);
          const saldoParcelado = Math.max(0, data.valor_total - (data.valor_entrada || 0));
          linha('Valor da Parcela: ', fmt(saldoParcelado / qtdParcelasPagamento));
        }
      }
      if (data.forma_pagamento) linha('Forma de Pagamento (saldo): ', FORMAS_PAGAMENTO[data.forma_pagamento] || data.forma_pagamento);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'A entrega definitiva e liberação do trailer ficam condicionadas à quitação integral do valor contratado, bem como de eventuais itens adicionais solicitados e previamente aprovados pelo CONTRATANTE. O atraso no pagamento de qualquer parcela poderá acarretar incidência de multa de 2% sobre o valor em atraso, acrescida de juros de 1% ao mês, calculados proporcionalmente ao período de atraso.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── 4ª – DO PRAZO DE FABRICAÇÃO E ENTREGA ─────────────────────────
      clausula('4ª', 'DO PRAZO DE FABRICAÇÃO E ENTREGA');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        data.prazoFabricacaoDias
          ? `A previsão para conclusão e entrega é de ${data.prazoFabricacaoDias} dias corridos, contados a partir da assinatura deste contrato. Por se tratar de produto fabricado sob encomenda e de forma personalizada, o CONTRATANTE declara estar ciente de que o prazo poderá sofrer ajustes em situações decorrentes de fatores externos, indisponibilidade de componentes específicos, atrasos de fornecedores, alterações solicitadas pelo próprio CONTRATANTE, caso fortuito ou força maior. A CONTRATADA deverá comunicar ao CONTRATANTE eventual situação relevante que possa impactar significativamente a previsão de conclusão e entrega.`
          : 'A previsão de conclusão e entrega será acordada entre as partes. Por se tratar de produto fabricado sob encomenda e de forma personalizada, o CONTRATANTE declara estar ciente de que o prazo poderá sofrer ajustes em situações decorrentes de fatores externos, indisponibilidade de componentes específicos, atrasos de fornecedores, alterações solicitadas pelo próprio CONTRATANTE, caso fortuito ou força maior.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── 5ª – DAS ALTERAÇÕES E ITENS ADICIONAIS ────────────────────────
      clausula('5ª', 'DAS ALTERAÇÕES E ITENS ADICIONAIS');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'Qualquer alteração de projeto, acabamento, equipamento ou configuração solicitada pelo CONTRATANTE após a aprovação inicial estará sujeita à análise de viabilidade técnica pela CONTRATADA. Itens adicionais ou alterações que impliquem aumento de custos serão previamente orçados e somente serão executados após a aprovação do CONTRATANTE, passando a integrar o presente contrato mediante orçamento, termo aditivo ou outro documento escrito. Alterações realizadas durante o processo de fabricação poderão ocasionar alteração no prazo inicialmente previsto para entrega.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      if (data.observacao) {
        clausula('6ª', 'OBSERVAÇÕES');
        doc.font('Helvetica').fontSize(8).fillColor('#000').text(normalizarTexto(data.observacao), { align: 'justify' });
        doc.moveDown(0.6);
      }
      const nClausula = (base: number) => data.observacao ? base + 1 : base;

      // ── DOCUMENTAÇÃO E EMPLACAMENTO ───────────────────────────────────
      clausula(`${nClausula(6)}ª`, 'DA DOCUMENTAÇÃO E EMPLACAMENTO');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'O trailer será entregue documentado e emplacado em nome do CONTRATANTE, observados os procedimentos e exigências dos órgãos competentes. O CONTRATANTE compromete-se a fornecer, dentro dos prazos solicitados, todos os documentos e informações necessários para realização do registro e emplacamento. Eventuais atrasos decorrentes da ausência de documentos ou informações de responsabilidade do CONTRATANTE, ou decorrentes dos procedimentos e prazos dos órgãos públicos competentes, não serão considerados atraso de fabricação imputável à CONTRATADA.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── ENTREGA E CONFERÊNCIA ─────────────────────────────────────────
      clausula(`${nClausula(7)}ª`, 'DA ENTREGA E CONFERÊNCIA');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'No momento da entrega, o CONTRATANTE deverá realizar a conferência do trailer, de seus equipamentos, acabamentos e das especificações previstas neste contrato, sendo apresentadas orientações básicas referentes ao funcionamento dos principais sistemas e equipamentos instalados. A retirada e liberação definitiva do trailer ocorrerão somente após a quitação integral do contrato, incluindo eventuais itens adicionais contratados durante o processo de fabricação.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── GARANTIA ───────────────────────────────────────────────────
      clausula(`${nClausula(8)}ª`, 'DA GARANTIA');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'A CONTRATADA assegurará garantia sobre os serviços de fabricação e montagem realizados diretamente por ela, observados os prazos e condições previstos na legislação aplicável. Equipamentos e componentes fornecidos por terceiros (ar-condicionado, televisão, bateria, inversor, placa solar, eletrodomésticos e demais acessórios) estarão sujeitos às condições e prazos de garantia dos respectivos fabricantes. A garantia não abrangerá danos decorrentes de mau uso, acidentes, excesso de carga, utilização inadequada, modificações ou reparos realizados por terceiros sem autorização, falta de manutenção preventiva, desgaste natural decorrente do uso, ou utilização em desacordo com as especificações e orientações técnicas.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── OBRIGAÇÕES DO CONTRATANTE ────────────────────────────────────
      clausula(`${nClausula(9)}ª`, 'DAS OBRIGAÇÕES DO CONTRATANTE');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'Compete ao CONTRATANTE: efetuar os pagamentos nos valores, datas e condições estabelecidos neste contrato; fornecer os documentos necessários para documentação e emplacamento; aprovar, dentro de prazo razoável, definições de projeto, cores, acabamentos e demais escolhas solicitadas pela CONTRATADA; utilizar o trailer de acordo com suas especificações técnicas; respeitar os limites de peso e capacidade do conjunto; utilizar veículo trator compatível com o peso e as características do trailer; realizar as manutenções preventivas necessárias; e respeitar as orientações de segurança referentes ao transporte de animais e utilização da cavaleira, quando aplicável.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── RESCISÃO ───────────────────────────────────────────────────
      clausula(`${nClausula(10)}ª`, 'DA RESCISÃO');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'Em caso de desistência ou rescisão por iniciativa do CONTRATANTE após o início da fabricação, deverão ser considerados os custos efetivamente assumidos pela CONTRATADA, incluindo materiais adquiridos, componentes encomendados, mão de obra empregada e demais despesas diretamente relacionadas à fabricação personalizada do trailer, sempre observada a legislação aplicável. Eventual rescisão deverá ser formalizada por escrito entre as partes.',
        { align: 'justify' }
      );
      doc.moveDown(0.6);

      // ── DISPOSIÇÕES GERAIS ────────────────────────────────────────────
      clausula(`${nClausula(11)}ª`, 'DAS DISPOSIÇÕES GERAIS');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        'Fotos, desenhos, plantas, projetos, imagens e representações em 3D apresentados durante a negociação poderão possuir caráter ilustrativo, prevalecendo as especificações expressamente estabelecidas neste contrato e eventuais alterações posteriormente aprovadas por escrito pelas partes. Eventuais tolerâncias de medidas poderão ocorrer em razão das características construtivas e técnicas do projeto, desde que não comprometam sua finalidade e utilização. Por se tratar de fabricação personalizada e sob encomenda, eventuais alterações solicitadas pelo CONTRATANTE deverão ser formalizadas e aprovadas pela CONTRATADA antes de sua execução.',
        { align: 'justify' }
      );
      doc.moveDown(0.3);
      doc.text(
        `Fica eleito o foro da Comarca de ${data.vendedora_cidade || '___________'}${data.vendedora_estado ? `/${data.vendedora_estado}` : ''}, observadas as disposições da legislação aplicável, para dirimir eventuais controvérsias decorrentes deste contrato que não possam ser solucionadas amigavelmente entre as partes.`,
        { align: 'justify' }
      );
      doc.moveDown(0.3);
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#333').text(
        'As partes reconhecem e aceitam, para todos os fins de direito, a validade jurídica da assinatura eletrônica utilizada na celebração deste contrato, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001, dispensando a necessidade de certificado digital no padrão ICP-Brasil. A autenticidade e integridade das assinaturas são atestadas pelo registro de auditoria (endereço IP, data, hora e e-mail de cada signatário) gerado pela plataforma de assinatura eletrônica utilizada, o qual constitui parte integrante e inseparável deste instrumento.',
        { align: 'justify' }
      );
      doc.fillColor('#000').fontSize(8);
      doc.moveDown(1);

      // ── ASSINATURAS ──────────────────────────────────────────────
      const sigPage = paginaAtual;
      const sigY = doc.y;
      const sigYFrac = sigY / doc.page.height;
      const sigW = 180;
      doc.moveTo(50, sigY).lineTo(50 + sigW, sigY).strokeColor('#000').lineWidth(0.8).stroke();
      doc.moveTo(doc.page.width - 50 - sigW, sigY).lineTo(doc.page.width - 50, sigY).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
        .text('CONTRATANTE', 50, sigY + 4, { width: sigW, align: 'center' });
      doc.text('CONTRATADA', doc.page.width - 50 - sigW, sigY + 4, { width: sigW, align: 'center' });

      // ── FOOTER (em todas as páginas) — zera a margem inferior de cada página nesse
      // momento: sem isso o pdfkit acha que o rodapé estourou o limite e cria página extra em branco.
      const W = doc.page.width - 100;
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        desenharRodape();
        doc.fontSize(7).font('Helvetica').fillColor('#999')
          .text(`${data.vendedora_razao}  ·  CNPJ ${data.vendedora_cnpj}  ·  Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 50, doc.page.height - 65, { align: 'center', width: W });
      }

      doc.end();
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), sigPage, sigYFrac }));
    } catch (err) {
      reject(err);
    }
  });
}
