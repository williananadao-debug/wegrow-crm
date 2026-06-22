import PDFDocument from 'pdfkit';

export type ContratoData = {
  protocolo: string;
  emissora_razao: string;
  emissora_endereco: string;
  emissora_cnpj: string;
  emissora_nome: string;
  cliente: string;
  cnpj: string;
  inscricao_estadual: string;
  telefone: string;
  cidade: string;
  contrato_inicio: string;
  contrato_fim: string;
  itens: { servico: string; quantidade: number; precoUnitario: number; bonificacao?: boolean }[];
  desconto: number;
  valor_total: number;
  parcelas: string;
  vencimento: string;
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

export function gerarContratoBuffer(data: ContratoData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Contrato — ${data.cliente}` } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width - 100; // largura útil
      const corTitulo = '#111111';

      // ── HEADER ──────────────────────────────────────────────────
      doc.fontSize(16).font('Helvetica-Bold').fillColor(corTitulo)
        .text('CONTRATO PARA VEICULAÇÃO DE PUBLICIDADE', { align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor('#555')
        .text(`${data.emissora_nome}  ·  Protocolo #${data.protocolo}`, { align: 'center' });
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(0.8);

      // ── INTRO ────────────────────────────────────────────────────
      doc.fontSize(9).font('Helvetica').fillColor('#000');
      doc.text(
        'Que entre si fazem de um lado a empresa ',
        { continued: true }
      ).font('Helvetica-Bold').text(data.emissora_razao, { continued: true })
        .font('Helvetica').text(
          `, emissora de radiodifusão com sede à ${data.emissora_endereco || '___'}, CNPJ: ${data.emissora_cnpj || '___'}, neste ato representada denominada de EXECUTANTE, e de outro lado o CLIENTE:`,
          { align: 'justify' }
        );
      doc.moveDown(0.8);

      // ── DADOS DO CLIENTE ─────────────────────────────────────────
      const linha = (label: string, valor: string) => {
        doc.font('Helvetica-Bold').fontSize(9).text(label, { continued: true })
          .font('Helvetica').text(valor || '___________________________');
      };

      linha('CLIENTE: ', data.cliente.toUpperCase());
      linha('Razão Social: ', data.cliente.toUpperCase());
      linha('Nome Fantasia: ', data.cliente.toUpperCase());

      const y1 = doc.y;
      doc.font('Helvetica-Bold').text('Inscrição CNPJ: ', 50, y1, { continued: true })
        .font('Helvetica').text(data.cnpj || '___________________________', { continued: false });
      doc.font('Helvetica-Bold').text('Inscrição Estadual: ', 300, y1, { continued: true })
        .font('Helvetica').text(data.inscricao_estadual || '_______________');

      const y2 = doc.y;
      doc.font('Helvetica-Bold').text('Fone: ', 50, y2, { continued: true })
        .font('Helvetica').text(data.telefone || '___________________________', { continued: false });
      doc.font('Helvetica-Bold').text('Município: ', 300, y2, { continued: true })
        .font('Helvetica').text(data.cidade || '___________________________');

      doc.moveDown(0.6);
      doc.font('Helvetica').fontSize(9).fillColor('#000')
        .text('Visando a veiculação e divulgação da publicidade do CLIENTE acima, por meio da emissora de FM da EXECUTANTE, tudo conforme as condições a seguir indicadas.', { align: 'justify' });
      doc.moveDown(0.8);

      // ── SEÇÃO 1 ──────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo)
        .text('1. VEICULAÇÃO/CUSTO DA PUBLICIDADE');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      // Datas
      const yDatas = doc.y;
      doc.fontSize(9).font('Helvetica-Bold')
        .text(`INÍCIO DO CONTRATO: ${fmtData(data.contrato_inicio)}`, 50, yDatas)
        .text(`TÉRMINO DO CONTRATO: ${fmtData(data.contrato_fim)}`, 300, yDatas);
      doc.moveDown(0.6);

      // Tabela de itens
      const colX = [50, 350, 430];
      const rowH = 18;
      let ty = doc.y;

      // Header da tabela
      doc.rect(50, ty, W, rowH).fillAndStroke('#f0f0f0', '#000');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8);
      doc.text('PROGRAMAÇÃO', colX[0] + 4, ty + 4, { width: 295 });
      doc.text('QUANT.', colX[1] + 4, ty + 4, { width: 75, align: 'center' });
      doc.text('VALOR R$', colX[2] + 4, ty + 4, { width: 80, align: 'right' });
      ty += rowH;

      // Linhas de itens
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const item of data.itens) {
        doc.rect(50, ty, W, rowH).stroke('#000');
        doc.text(item.servico, colX[0] + 4, ty + 4, { width: 295 });
        doc.text(String(item.quantidade), colX[1] + 4, ty + 4, { width: 75, align: 'center' });
        if (item.bonificacao) {
          doc.fillColor('#b45309').font('Helvetica-Bold').text('BONIFICAÇÃO', colX[2] + 4, ty + 4, { width: 80, align: 'right' });
          doc.fillColor('#000').font('Helvetica');
        } else {
          doc.text(fmt(item.quantidade * item.precoUnitario), colX[2] + 4, ty + 4, { width: 80, align: 'right' });
        }
        ty += rowH;
      }

      // Desconto (se houver)
      const subtotal = data.itens.reduce((s, i) => i.bonificacao ? s : s + i.quantidade * i.precoUnitario, 0);
      if (data.desconto > 0) {
        doc.rect(50, ty, W, rowH).stroke('#000');
        doc.font('Helvetica-Bold').text('Subtotal', colX[0] + 4, ty + 4, { width: 295 });
        doc.font('Helvetica').text('', colX[1] + 4, ty + 4, { width: 75, align: 'center' });
        doc.text(fmt(subtotal), colX[2] + 4, ty + 4, { width: 80, align: 'right' });
        ty += rowH;

        doc.rect(50, ty, W, rowH).stroke('#000');
        doc.font('Helvetica-Bold').text('Desconto', colX[0] + 4, ty + 4, { width: 295 });
        doc.font('Helvetica').text('', colX[1] + 4, ty + 4, { width: 75, align: 'center' });
        doc.fillColor('#cc0000').text(`- ${fmt(data.desconto)}`, colX[2] + 4, ty + 4, { width: 80, align: 'right' });
        doc.fillColor('#000');
        ty += rowH;
      }

      // Total
      doc.rect(50, ty, W, rowH).stroke('#000');
      doc.font('Helvetica-Bold').text('TOTAL', colX[0] + 4, ty + 4, { width: 295, align: 'right' });
      doc.text('', colX[1] + 4, ty + 4, { width: 75 });
      doc.text(fmt(data.valor_total), colX[2] + 4, ty + 4, { width: 80, align: 'right' });
      ty += rowH;

      doc.text('', 50, ty);
      doc.moveDown(1);

      // ── SEÇÃO 2 ──────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('2. OUTRAS CONDIÇÕES');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      const condicoes = [
        '1) O presente contrato tem caráter irrevogável;',
        '2) As inserções objeto do presente contrato são intransferíveis;',
        '3) As parcelas pagas fora do prazo de seus vencimentos incidirão em juros e mora estabelecidos na fatura;',
        '4) O presente contrato somente poderá ser rescindido 30 (trinta) dias após sua contratação;',
        '5) Caso o cliente solicite a rescisão antecipada do contrato (antes do término da vigência total acordada), esta só produzirá efeitos ao final do ciclo mensal de veiculação em andamento, considerando-se ciclos de 30 (trinta) dias corridos contados a partir do início do contrato. Cancelamentos não terão efeito imediato e não serão proporcionais.',
        '6) Fica eleito o Fórum da Cidade de Taió para dirimir dúvidas ou questões oriundas do presente, bem como para ser ajuizada ação de cobrança.',
      ];
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const c of condicoes) {
        doc.text(c, { align: 'justify' });
        doc.moveDown(0.2);
      }
      doc.moveDown(0.6);

      // ── SEÇÃO 3 ──────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(corTitulo).text('3. FORMA DE PAGAMENTO');
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      doc.fontSize(9).fillColor('#000');
      linha('Parcela(s): ', data.parcelas || '1');
      linha('Vencimento(s): ', fmtData(data.vencimento));
      doc.moveDown(0.3);
      linha('Contato para envio da Fatura — WhatsApp: ', data.telefone || '___________________________');
      linha('Praça de Pagamento: ', data.cidade || '___________________________');
      doc.moveDown(1.5);

      // ── ASSINATURAS ──────────────────────────────────────────────
      const sigY = doc.y;
      const sigW = 180;
      doc.moveTo(50, sigY).lineTo(50 + sigW, sigY).strokeColor('#000').lineWidth(0.8).stroke();
      doc.moveTo(doc.page.width - 50 - sigW, sigY).lineTo(doc.page.width - 50, sigY).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
        .text('Assinatura do Cliente', 50, sigY + 4, { width: sigW, align: 'center' });
      doc.text(`Representante da ${data.emissora_nome || 'Emissora'}`, doc.page.width - 50 - sigW, sigY + 4, { width: sigW, align: 'center' });

      // ── FOOTER ───────────────────────────────────────────────────
      doc.fontSize(7).font('Helvetica').fillColor('#999')
        .text(
          `${data.emissora_razao}  ·  CNPJ ${data.emissora_cnpj}  ·  Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
          50, doc.page.height - 40, { align: 'center', width: W }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
