import PDFDocument from 'pdfkit';

// ⚠️ RASCUNHO — as cláusulas de "OUTRAS CONDIÇÕES" abaixo são um modelo padrão de
// mercado pra venda de bem manufaturado sob encomenda, escrito pra a empresa revisar
// com advogado antes de usar com cliente de verdade. Não é aconselhamento jurídico.
// Estrutura/código copiados de contract-radio-pdf.ts (mesmo padrão de geração de PDF +
// Docuseal), conteúdo das cláusulas é todo novo (venda de mercadoria != veiculação de
// publicidade — prazo de fabricação, garantia e cancelamento de encomenda não existem
// no contrato de rádio).

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
  prazoFabricacaoDias: number | null;
  observacao?: string;
};

const FORMAS_PAGAMENTO: Record<string, string> = {
  boleto: 'Boleto', dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', transferencia: 'Transferência',
};

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
const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
function nomeEstado(uf?: string) { return uf ? (UF_NOMES[uf.toUpperCase()] || uf) : ''; }

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
      let paginaAtual = 1;
      doc.on('pageAdded', () => { paginaAtual++; });

      // ── AVISO DE MINUTA ────────────────────────────────────────────
      doc.rect(50, 50, doc.page.width - 100, 22).fillAndStroke('#fef3c7', '#d97706');
      doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(8)
        .text('MINUTA — MODELO PADRÃO, SUJEITO A REVISÃO JURÍDICA ANTES DO USO OFICIAL', 50, 57, { width: doc.page.width - 100, align: 'center' });
      doc.moveDown(2.2);

      // ── HEADER ──────────────────────────────────────────────────
      doc.fontSize(16).font('Helvetica-Bold').fillColor(corTitulo)
        .text('CONTRATO DE COMPRA E VENDA DE BEM MÓVEL SOB ENCOMENDA', { align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor('#555')
        .text(`${data.vendedora_nome}  ·  Protocolo #${data.protocolo}`, { align: 'center' });
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(0.8);

      // ── INTRO / PARTES ───────────────────────────────────────────
      doc.fontSize(8).font('Helvetica').fillColor('#000');
      const localVendedora = data.vendedora_cidade
        ? `, na cidade de ${data.vendedora_cidade}${data.vendedora_estado ? ` - Estado de ${nomeEstado(data.vendedora_estado)}` : ''}`
        : '';
      doc.text('Pelo presente instrumento particular, de um lado ', { continued: true })
        .font('Helvetica-Bold').text(data.vendedora_razao, { continued: true })
        .font('Helvetica').text(
          `, com sede à ${data.vendedora_endereco || '___'}${localVendedora}, CNPJ: ${data.vendedora_cnpj || '___'}, doravante denominada VENDEDORA, e de outro lado o COMPRADOR:`,
          { align: 'justify' }
        );
      doc.moveDown(0.8);

      const linha = (label: string, valor: string) => {
        doc.font('Helvetica-Bold').fontSize(8).text(label, 50, doc.y, { continued: true })
          .font('Helvetica').text(valor || '___________________________');
      };
      doc.font('Helvetica-Bold').fontSize(8).text('COMPRADOR: ', 50, doc.y);
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
        .text('Têm entre si justo e acordado o presente contrato de compra e venda de bem móvel fabricado sob encomenda, conforme especificações e condições a seguir.', { align: 'justify' });
      doc.moveDown(0.8);

      // ── 1. OBJETO ────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('1. OBJETO E ESPECIFICAÇÕES');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const item of data.itens) {
        doc.font('Helvetica-Bold').text(`${item.servico} — ${item.quantidade}x ${fmt(item.precoUnitario)}`);
        if (item.descricao) {
          doc.font('Helvetica').fontSize(7.5).fillColor('#333').text(item.descricao, { align: 'justify' });
          doc.fillColor('#000').fontSize(8);
        }
        doc.moveDown(0.4);
      }

      // ── 2. PRAZO DE ENTREGA ────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('2. PRAZO DE ENTREGA');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(
        data.prazoFabricacaoDias
          ? `O prazo estimado de fabricação e entrega é de ${data.prazoFabricacaoDias} dias corridos, contados a partir da assinatura deste contrato e da confirmação do pagamento do sinal (quando aplicável). O prazo é estimado e pode variar conforme personalização solicitada, disponibilidade de insumos e casos fortuitos ou de força maior, sem que isso gere multa ou indenização à VENDEDORA.`
          : 'O prazo de entrega será acordado entre as partes conforme especificações do item, disponibilidade de insumos e casos fortuitos ou de força maior, sem que isso gere multa ou indenização à VENDEDORA.',
        { align: 'justify' }
      );
      doc.moveDown(0.8);

      // ── 3. VALOR E FORMA DE PAGAMENTO ──────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('3. VALOR E FORMA DE PAGAMENTO');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#000');
      const subtotal = data.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
      if (data.desconto > 0) {
        linha('Subtotal: ', fmt(subtotal));
        linha('Desconto: ', `- ${fmt(data.desconto)}`);
      }
      linha('Valor Total: ', fmt(data.valor_total));
      linha('Parcela(s): ', data.parcelas || '1');
      linha('Vencimento(s): ', fmtVencimentos(data.vencimento, data.parcelas || '1', data.vencimentos_datas));
      if (data.forma_pagamento) linha('Forma de Pagamento: ', FORMAS_PAGAMENTO[data.forma_pagamento] || data.forma_pagamento);
      doc.moveDown(0.8);

      if (data.observacao) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('4. OBSERVAÇÕES');
        doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
        doc.moveDown(0.4);
        doc.font('Helvetica').fontSize(8).fillColor('#000').text(data.observacao, { align: 'justify' });
        doc.moveDown(0.8);
      }

      // ── OUTRAS CONDIÇÕES ────────────────────────────────────────────
      const proximaSecao = data.observacao ? 5 : 4;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text(`${proximaSecao}. OUTRAS CONDIÇÕES`);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      const condicoes = [
        '1) Trata-se de bem fabricado sob encomenda, de acordo com as especificações acordadas entre as partes — não se aplica direito de arrependimento após o início da fabricação.',
        '2) Em caso de cancelamento solicitado pelo COMPRADOR após o início da fabricação, a VENDEDORA reterá do sinal/valores já pagos o montante correspondente aos custos de material e mão de obra já empregados até a data do pedido de cancelamento, a ser apurado e informado ao COMPRADOR.',
        '3) A VENDEDORA garante o bem contra defeitos de fabricação pelo prazo de 90 (noventa) dias, contados da data de entrega, excluindo-se desgaste natural de uso, mau uso, acidentes, alterações ou reparos realizados por terceiros não autorizados.',
        '4) A propriedade e os riscos sobre o bem transferem-se ao COMPRADOR mediante a quitação integral do valor total e a efetiva entrega/retirada do bem.',
        '5) Despesas de documentação, emplacamento e registro perante os órgãos competentes correm por conta do COMPRADOR, salvo disposição em contrário acordada por escrito entre as partes.',
        '6) As parcelas pagas fora do prazo de vencimento incidirão em juros e multa de mora conforme legislação aplicável.',
        `7) Fica eleito o Foro da Comarca de ${data.vendedora_cidade || '___________'} para dirimir quaisquer dúvidas ou questões oriundas do presente contrato.`,
        '8) As partes reconhecem e aceitam, para todos os fins de direito, a validade jurídica da assinatura eletrônica utilizada na celebração deste contrato, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001, dispensando a necessidade de certificado digital no padrão ICP-Brasil. A autenticidade e integridade das assinaturas são atestadas pelo registro de auditoria (endereço IP, data, hora e e-mail de cada signatário) gerado pela plataforma de assinatura eletrônica utilizada, o qual constitui parte integrante e inseparável deste instrumento.',
      ];
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const c of condicoes) { doc.text(c, { align: 'justify' }); doc.moveDown(0.2); }
      doc.moveDown(1.2);

      // ── ASSINATURAS ──────────────────────────────────────────────
      const sigPage = paginaAtual;
      const sigY = doc.y;
      const sigYFrac = sigY / doc.page.height;
      const sigW = 180;
      doc.moveTo(50, sigY).lineTo(50 + sigW, sigY).strokeColor('#000').lineWidth(0.8).stroke();
      doc.moveTo(doc.page.width - 50 - sigW, sigY).lineTo(doc.page.width - 50, sigY).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
        .text('Assinatura do Comprador', 50, sigY + 4, { width: sigW, align: 'center' });
      doc.text(`Representante da ${data.vendedora_nome || 'Vendedora'}`, doc.page.width - 50 - sigW, sigY + 4, { width: sigW, align: 'center' });

      // ── FOOTER (em todas as páginas) — zera a margem inferior de cada página nesse
      // momento: sem isso o pdfkit acha que o rodapé estourou o limite e cria página extra em branco.
      const W = doc.page.width - 100;
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
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
