import PDFDocument from 'pdfkit';

export type ContratoVeiculoData = {
  protocolo: string;
  loja_razao: string;
  loja_cnpj: string;
  loja_endereco: string;
  loja_nome: string;
  loja_cidade?: string;
  loja_estado?: string;
  comprador_nome: string;
  comprador_documento: string;
  comprador_endereco?: string;
  comprador_telefone?: string;
  comprador_cidade?: string;
  veiculo_referencia: string;
  veiculo_placa: string;
  valor_total: number;
  forma_pagamento?: string;
  data_venda: string;
};

function fmt(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function fmtData(d: string) {
  if (!d) return '___/___/______';
  try {
    return new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR');
  } catch { return d; }
}

const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
function nomeEstado(uf?: string) {
  if (!uf) return '';
  return UF_NOMES[uf.toUpperCase()] || uf;
}

export type ContratoVeiculoBufferResult = { buffer: Buffer; sigPage: number; sigYFrac: number };

// Modelo padrão de compra e venda de veículo entre pessoa jurídica (loja) e cliente —
// mesma estrutura/motivo de contract-radio-pdf.ts (bufferPages + sigPage/sigYFrac
// repassados pro Docuseal posicionar os campos de assinatura no lugar certo). Cláusulas
// são um modelo genérico de mercado; recomenda-se revisão jurídica antes de uso em
// grande escala — não substitui orientação de um advogado da loja.
export function gerarContratoVeiculoBuffer(data: ContratoVeiculoData): Promise<ContratoVeiculoBufferResult> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 70, left: 50, right: 50 },
        bufferPages: true,
        info: { Title: `Contrato de compra e venda — ${data.veiculo_placa}` },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);

      let paginaAtual = 1;
      doc.on('pageAdded', () => { paginaAtual++; });

      const corTitulo = '#111111';
      const linha = (label: string, valor: string) => {
        doc.font('Helvetica-Bold').fontSize(9).text(label, 50, doc.y, { continued: true })
          .font('Helvetica').text(valor || '___________________________');
      };

      // ── HEADER ──────────────────────────────────────────────────
      doc.fontSize(15).font('Helvetica-Bold').fillColor(corTitulo)
        .text('CONTRATO DE COMPRA E VENDA DE VEÍCULO', { align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor('#555')
        .text(`${data.loja_nome}  ·  Protocolo #${data.protocolo}`, { align: 'center' });
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(0.8);

      // ── PARTES ──────────────────────────────────────────────────
      const localLoja = data.loja_cidade ? `, na cidade de ${data.loja_cidade}${data.loja_estado ? ` - Estado de ${nomeEstado(data.loja_estado)}` : ''}` : '';
      doc.fontSize(9).font('Helvetica').fillColor('#000')
        .text('Pelo presente instrumento particular, de um lado ', { continued: true })
        .font('Helvetica-Bold').text(data.loja_razao, { continued: true })
        .font('Helvetica').text(`, com sede à ${data.loja_endereco || '___'}${localLoja}, CNPJ ${data.loja_cnpj || '___'}, doravante denominada VENDEDORA, e de outro lado:`, { align: 'justify' });
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').fontSize(9).text('COMPRADOR(A): ', 50, doc.y);
      linha('Nome: ', data.comprador_nome.toUpperCase());
      linha('CPF/CNPJ: ', data.comprador_documento || '___');
      linha('Endereço: ', data.comprador_endereco || '___');
      const y1 = doc.y;
      doc.font('Helvetica-Bold').text('Telefone: ', 50, y1, { continued: true, width: 240 })
        .font('Helvetica').text(data.comprador_telefone || '___');
      doc.font('Helvetica-Bold').text('Cidade: ', 300, y1, { continued: true })
        .font('Helvetica').text(data.comprador_cidade || '___');
      doc.x = 50;
      doc.y = Math.max(doc.y, y1 + 14);
      doc.moveDown(0.6);
      doc.font('Helvetica').fontSize(9)
        .text('doravante denominado(a) COMPRADOR(A), tendo entre si justo e contratado o presente Contrato de Compra e Venda de Veículo, mediante as cláusulas a seguir.', { align: 'justify' });
      doc.moveDown(0.8);

      // ── OBJETO ──────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('1. OBJETO');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      linha('Veículo: ', data.veiculo_referencia || '___');
      linha('Placa: ', data.veiculo_placa || '___');
      linha('Data da venda: ', fmtData(data.data_venda));
      doc.moveDown(0.6);

      // ── PREÇO E PAGAMENTO ───────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('2. PREÇO E FORMA DE PAGAMENTO');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      linha('Valor total: ', fmt(data.valor_total));
      if (data.forma_pagamento) linha('Forma de pagamento: ', data.forma_pagamento);
      doc.moveDown(0.6);

      // ── CONDIÇÕES ───────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('3. CONDIÇÕES GERAIS');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      const condicoes = [
        '1) A VENDEDORA declara ser legítima proprietária do veículo acima descrito, ou possuidora com poderes de disposição, e responsável pela sua procedência.',
        '2) A transferência de propriedade perante o órgão de trânsito competente será providenciada em até 30 (trinta) dias corridos a contar desta data, cabendo ao COMPRADOR(A) a comunicação de venda quando aplicável.',
        '3) O veículo é entregue ao COMPRADOR(A) no estado em que se encontra, tendo sido vistoriado e aceito antes da assinatura deste contrato.',
        '4) Eventuais multas, débitos de IPVA, licenciamento ou infrações de trânsito com data anterior à venda são de responsabilidade da VENDEDORA; os posteriores à data da venda são de responsabilidade do COMPRADOR(A).',
        `5) Fica eleito o Fórum da Cidade de ${data.loja_cidade || '___'} para dirimir dúvidas ou questões oriundas do presente contrato.`,
        '6) As partes reconhecem e aceitam, para todos os fins de direito, a validade jurídica da assinatura eletrônica utilizada na celebração deste contrato, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001, dispensando a necessidade de certificado digital no padrão ICP-Brasil.',
      ];
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const c of condicoes) { doc.text(c, { align: 'justify' }); doc.moveDown(0.25); }
      doc.moveDown(1.2);

      // ── ASSINATURAS ─────────────────────────────────────────────
      const sigPage = paginaAtual;
      const sigY = doc.y;
      const sigYFrac = sigY / doc.page.height;
      const sigW = 180;
      doc.moveTo(50, sigY).lineTo(50 + sigW, sigY).strokeColor('#000').lineWidth(0.8).stroke();
      doc.moveTo(doc.page.width - 50 - sigW, sigY).lineTo(doc.page.width - 50, sigY).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
        .text(`Representante da ${data.loja_nome || 'Vendedora'}`, 50, sigY + 4, { width: sigW, align: 'center' });
      doc.text('Assinatura do Comprador', doc.page.width - 50 - sigW, sigY + 4, { width: sigW, align: 'center' });

      // ── FOOTER ──────────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc.fontSize(7).font('Helvetica').fillColor('#999')
          .text(`${data.loja_razao}  ·  CNPJ ${data.loja_cnpj}  ·  Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 50, doc.page.height - 55, { align: 'center', width: doc.page.width - 100 });
      }

      doc.end();
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), sigPage, sigYFrac }));
    } catch (err) {
      reject(err);
    }
  });
}
