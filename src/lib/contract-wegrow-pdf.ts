import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export type ContratoWegrowData = {
  contratada_razao: string;
  contratada_cnpj: string;
  contratada_endereco: string;
  contratada_banco: string;
  cliente_razao: string;
  cliente_cnpj: string;
  cliente_endereco: string;
  modulos: string; // já formatado, ex: "Deals, Pulse, Relatórios"
  valor_mensal: number;
  dia_vencimento: number;
  data_inicio: string; // dd/mm/aaaa já formatado
  data_assinatura: string; // ex: "Curitiba/PR, 17 de agosto de 2026"
  foro_comarca: string;
  canal_suporte: string;
  sla_resposta: string;
};

const VERDE = '#17a34a';
const VERDE_ESCURO = '#0b1120';
const CINZA_TEXTO = '#4a5063';
const CINZA_LINHA = '#e2e4ea';

function fmt(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export type ContratoWegrowBufferResult = {
  buffer: Buffer;
  sigPageContratada: number;
  sigYFracContratada: number;
  sigPageContratante: number;
  sigYFracContratante: number;
};

export function gerarContratoWegrowBuffer(data: ContratoWegrowData): Promise<ContratoWegrowBufferResult> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 70, left: 56, right: 56 },
        bufferPages: true,
        info: { Title: `Contrato de Serviço — ${data.cliente_razao}` },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);

      const W = doc.page.width - 112; // largura útil (margens 56+56)
      const logoPath = path.join(process.cwd(), 'public', 'logo.png');
      const logoExiste = fs.existsSync(logoPath);

      // ── MARCA D'ÁGUA (logo repetida, bem sutil, girada) ──────────────
      const desenharMarcaDagua = () => {
        if (!logoExiste) return;
        doc.opacity(0.035);
        const passo = 150;
        for (let y = -60; y < doc.page.height + 60; y += passo) {
          for (let x = -60; x < doc.page.width + 60; x += passo) {
            doc.save();
            doc.rotate(-28, { origin: [x + 35, y + 35] });
            try { doc.image(logoPath, x, y, { width: 70 }); } catch { /* ignora tile que falhar */ }
            doc.restore();
          }
        }
        doc.opacity(1);
      };
      desenharMarcaDagua();
      doc.on('pageAdded', desenharMarcaDagua);

      // ── LETTERHEAD ────────────────────────────────────────────────
      const topoY = 50;
      if (logoExiste) {
        doc.image(logoPath, 56, topoY, { width: 26, height: 26 });
      }
      doc.font('Helvetica-Bold').fontSize(15).fillColor(VERDE_ESCURO)
        .text('We', 56 + (logoExiste ? 34 : 0), topoY + 5, { continued: true })
        .fillColor(VERDE).text('Grow');
      doc.font('Helvetica').fontSize(7).fillColor(CINZA_TEXTO)
        .text('CONTRATO DE PRESTAÇÃO', doc.page.width - 56 - 200, topoY + 2, { width: 200, align: 'right' })
        .text('DE SERVIÇOS DE SOFTWARE', { width: 200, align: 'right' });
      doc.moveTo(56, topoY + 32).lineTo(doc.page.width - 56, topoY + 32).strokeColor(VERDE).lineWidth(2).stroke();
      doc.y = topoY + 48;

      // ── TÍTULO ────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(13).fillColor(VERDE_ESCURO)
        .text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SOFTWARE', { align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(CINZA_TEXTO)
        .text('SISTEMA DE GESTÃO CRM WEGROW', { align: 'center', characterSpacing: 0.5 });
      doc.moveDown(1.2);

      // ── QUALIFICAÇÃO DAS PARTES ──────────────────────────────────
      const partesY = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(VERDE_ESCURO);
      const alturaPartes = 92;
      doc.rect(56, partesY, W, alturaPartes).fillAndStroke('#f0fbf4', '#d3f0dd');
      doc.fillColor(VERDE_ESCURO);
      let py = partesY + 10;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(VERDE).text('CONTRATADA', 66, py);
      py += 11;
      doc.font('Helvetica').fontSize(8.5).fillColor(VERDE_ESCURO).text(
        `${data.contratada_razao}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${data.contratada_cnpj}, com sede em ${data.contratada_endereco}.`,
        66, py, { width: W - 20, align: 'justify' }
      );
      py = Math.max(doc.y + 8, partesY + 50);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(VERDE).text('CONTRATANTE', 66, py);
      py += 11;
      doc.font('Helvetica').fontSize(8.5).fillColor(VERDE_ESCURO).text(
        `${data.cliente_razao}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${data.cliente_cnpj}, com sede em ${data.cliente_endereco}.`,
        66, py, { width: W - 20, align: 'justify' }
      );
      doc.y = partesY + alturaPartes + 14;

      doc.font('Helvetica').fontSize(8.5).fillColor(CINZA_TEXTO)
        .text('As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Software, que se regerá pelas cláusulas seguintes.', { align: 'justify' });
      doc.moveDown(1);

      // ── CLÁUSULAS ─────────────────────────────────────────────────
      const clausula = (num: number, titulo: string, paragrafos: string[]) => {
        if (doc.y > doc.page.height - 140) doc.addPage();
        doc.moveDown(0.6);
        const y0 = doc.y;
        doc.roundedRect(56, y0, 15, 15, 3).fill(VERDE);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text(String(num), 56, y0 + 3.5, { width: 15, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(VERDE_ESCURO).text(titulo.toUpperCase(), 78, y0 + 1, { width: W - 22 });
        doc.moveTo(56, doc.y + 4).lineTo(doc.page.width - 56, doc.y + 4).strokeColor(CINZA_LINHA).lineWidth(0.75).stroke();
        doc.y += 12;
        doc.font('Helvetica').fontSize(8.5).fillColor('#000');
        for (const p of paragrafos) {
          doc.text(p, 56, doc.y, { width: W, align: 'justify' });
          doc.moveDown(0.35);
        }
      };

      clausula(1, 'Do objeto', [
        `1.1. O presente contrato tem por objeto a prestação, pela WEGROW à CONTRATANTE, de acesso ao sistema de gestão (CRM) WeGrow, compreendendo os seguintes módulos contratados: ${data.modulos}.`,
        '1.2. Módulos não listados acima não integram o objeto deste contrato, ainda que disponíveis na plataforma, e seu uso dependerá de aditivo contratual e ajuste de valor.',
      ]);

      clausula(2, 'Do valor e forma de pagamento', [
        `2.1. Pela prestação dos serviços descritos na Cláusula 1ª, a CONTRATANTE pagará à WEGROW o valor mensal de ${fmt(data.valor_mensal)}.`,
        `2.2. O pagamento será realizado mensalmente, todo dia ${data.dia_vencimento} de cada mês, via cobrança recorrente emitida pela plataforma Asaas, com início em ${data.data_inicio}.`,
        '2.3. Reajuste anual. O valor mensal referido no item 2.1 será reajustado anualmente, na data de aniversário deste contrato, pela variação acumulada do IPCA (Índice Nacional de Preços ao Consumidor Amplo) no período, ou por outro índice que venha a substituí-lo.',
        `2.4. Dados bancários da CONTRATADA para pagamento — Chave Pix (CNPJ): ${data.contratada_cnpj} · Favorecido: ${data.contratada_razao} · Instituição: ${data.contratada_banco}. A cobrança recorrente referida no item 2.2 prevalece como meio padrão de pagamento; estes dados servem para pagamentos avulsos ou de eventual falha na cobrança automática.`,
      ]);

      clausula(3, 'Do atraso no pagamento', [
        '3.1. O não pagamento na data de vencimento sujeitará a CONTRATANTE à incidência de multa moratória de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die, sem prejuízo da atualização monetária.',
        '3.2. O atraso no pagamento não implica, por si só, suspensão do acesso da CONTRATANTE ao sistema, permanecendo este contrato regido pelas demais cláusulas independentemente da situação financeira entre as partes.',
      ]);

      clausula(4, 'Do prazo e do cancelamento', [
        '4.1. Este contrato vigora por prazo indeterminado, a partir da data de sua assinatura, não havendo fidelidade ou período mínimo de permanência.',
        '4.2. Qualquer das partes poderá rescindir este contrato a qualquer tempo, mediante aviso prévio por escrito (e-mail ou WhatsApp) com antecedência mínima de 30 (trinta) dias.',
        '4.3. Encerrado o contrato, a CONTRATANTE terá direito à exportação de todos os seus dados armazenados no sistema, conforme Cláusula 5ª, dentro do prazo de aviso prévio.',
      ]);

      clausula(5, 'Dos dados da contratante', [
        '5.1. Os dados inseridos pela CONTRATANTE no sistema (cadastros, negociações, relatórios e demais informações geradas no uso da plataforma) são de propriedade exclusiva da CONTRATANTE.',
        '5.2. A CONTRATANTE poderá, a qualquer momento durante a vigência do contrato, solicitar a exportação de seus dados em formato legível, e a WEGROW se compromete a atendê-la em prazo razoável, não superior a 15 (quinze) dias corridos.',
        '5.3. Encerrado o contrato, os dados da CONTRATANTE serão mantidos por até 90 (noventa) dias para eventual exportação e, após esse prazo, poderão ser excluídos pela WEGROW.',
      ]);

      clausula(6, 'Da confidencialidade', [
        '6.1. As partes se comprometem a manter sigilo sobre todas as informações confidenciais a que tiverem acesso em razão deste contrato, incluindo dados comerciais, financeiros e estratégicos, não as divulgando a terceiros sem autorização prévia e por escrito da outra parte, exceto quando exigido por lei ou determinação judicial.',
        '6.2. Esta obrigação de confidencialidade permanece válida mesmo após o encerramento deste contrato, pelo prazo de 2 (dois) anos.',
      ]);

      clausula(7, 'Do suporte', [
        `7.1. A WEGROW prestará suporte técnico à CONTRATANTE via ${data.canal_suporte}, em horário comercial, com tempo de resposta estimado de ${data.sla_resposta} para questões de funcionamento do sistema.`,
        '7.2. Falhas críticas que impeçam o uso do sistema (indisponibilidade total) terão prioridade de atendimento sobre dúvidas de uso ou solicitações de melhoria.',
      ]);

      clausula(8, 'Da proteção de dados (LGPD)', [
        '8.1. As partes se comprometem a tratar os dados pessoais a que tiverem acesso em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados — LGPD), utilizando-os exclusivamente para as finalidades relacionadas à execução deste contrato.',
        '8.2. A WEGROW adota medidas técnicas e administrativas razoáveis para proteger os dados armazenados na plataforma contra acessos não autorizados, utilizando infraestrutura de provedores compatíveis com a LGPD (Vercel e Supabase).',
      ]);

      clausula(9, 'Das disposições gerais', [
        '9.1. Este contrato não estabelece qualquer vínculo de sociedade, associação ou relação de emprego entre as partes.',
        '9.2. Alterações a este contrato somente serão válidas se realizadas por escrito e assinadas por ambas as partes.',
        `9.3. Fica eleito o foro da comarca de ${data.foro_comarca} para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`,
      ]);

      doc.moveDown(0.8);
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.font('Helvetica').fontSize(8.5).fillColor('#000')
        .text('E, por estarem assim justas e contratadas, as partes assinam o presente instrumento.', { align: 'justify' });
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text(data.data_assinatura);
      doc.moveDown(2.2);

      // ── ASSINATURAS (posição rastreada pra Docuseal posicionar os campos) ──
      const sigPage = doc.bufferedPageRange().count; // página atual (1-based, já que count = nº de páginas até aqui)
      const sigY = doc.y;
      const sigYFrac = sigY / doc.page.height;
      const sigW = 200;
      doc.moveTo(56, sigY).lineTo(56 + sigW, sigY).strokeColor('#000').lineWidth(0.8).stroke();
      doc.moveTo(doc.page.width - 56 - sigW, sigY).lineTo(doc.page.width - 56, sigY).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
        .text(data.contratada_razao, 56, sigY + 4, { width: sigW, align: 'center' })
        .font('Helvetica').fontSize(7).text('CONTRATADA', 56, doc.y, { width: sigW, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8)
        .text(data.cliente_razao, doc.page.width - 56 - sigW, sigY + 4, { width: sigW, align: 'center' })
        .font('Helvetica').fontSize(7).text('CONTRATANTE', doc.page.width - 56 - sigW, doc.y, { width: sigW, align: 'center' });

      // ── RODAPÉ (todas as páginas) ────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc.fontSize(7).font('Helvetica').fillColor('#9aa0af')
          .text(`WeGrow · Sistema de Gestão para Rádios · Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 56, doc.page.height - 45, { align: 'center', width: W });
      }

      doc.end();
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        sigPageContratada: sigPage,
        sigYFracContratada: sigYFrac,
        sigPageContratante: sigPage,
        sigYFracContratante: sigYFrac,
      }));
    } catch (err) {
      reject(err);
    }
  });
}
