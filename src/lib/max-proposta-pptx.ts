import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

// Preenche o template docs/max/template-proposta.pptx (fornecido pelo Leo/IAlto). Um .pptx
// é um zip de XML (OOXML) — não existe biblioteca de "template filling" já usada neste repo
// (o padrão de PDF existente, contract-wegrow-pdf.ts, desenha tudo do zero com pdfkit; aqui
// é diferente: o slide já vem pronto, só troca o texto de placeholders específicos).
//
// O template tem só 1 slide com texto dinâmico (slide7.xml — os outros 7 são só imagem/
// capa/fechamento). Nele existem exatamente 3 placeholders, cada um um <a:t> sozinho dentro
// do seu próprio <a:p><a:r>...</a:r></a:p>:
//   - "(nome da empresa)"           → nome do cliente (linha única)
//   - run de "x" minúsculo (50+)     → corpo da Proposta 01 (multi-linha)
//   - run de "Xx" (X maiúsculo + x)  → corpo da Proposta 02 (multi-linha, opcional)
// O rodapé e a saudação já são fixos no template — nunca tocar neles (ver instruções do Max).

export type PropostaPptx = { titulo: string; corpo: string };

const TEMPLATE_PATH = path.join(process.cwd(), 'docs', 'max', 'template-proposta.pptx');
const SLIDE_PATH = 'ppt/slides/slide7.xml';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Cada linha do texto vira o próprio parágrafo, reaproveitando a formatação (rPr) do
// placeholder original — é o jeito de ter quebra de linha real no PPTX (um <a:t> não
// interpreta \n; renderer ignora ou mostra como espaço).
function buildParagraphs(texto: string, rPrXml: string): string {
  const linhas = texto.split('\n');
  return linhas
    .map(linha => {
      const t = linha.trim().length === 0 ? ' ' : escapeXml(linha);
      return `<a:p><a:r>${rPrXml}<a:t>${t}</a:t></a:r></a:p>`;
    })
    .join('');
}

// Localiza o placeholder por POSIÇÃO (indexOf/lastIndexOf), não por uma regex genérica de
// ponta a ponta — um <a:rPr>...</a:rPr>.*? sem fronteira, quando falha no primeiro
// candidato, faz o motor de regex backtrackar e "engolir" parágrafos inteiros (inclusive
// texto já substituído), inflando o XML absurdamente. Isolar o <a:p>...</a:p> exato primeiro
// e só then extrair o rPr de dentro dele elimina esse risco.
function substituirParagrafoPlaceholder(xml: string, padraoPlaceholder: string, novoTexto: string): string {
  const tRe = new RegExp(`<a:t>${padraoPlaceholder}<\\/a:t>`);
  const tMatch = xml.match(tRe);
  if (!tMatch || tMatch.index === undefined) {
    throw new Error(`Placeholder não encontrado no template (padrão: ${padraoPlaceholder}) — o template-proposta.pptx pode ter sido editado/trocado.`);
  }

  const pStart = xml.lastIndexOf('<a:p>', tMatch.index);
  const pEndTagIndex = xml.indexOf('</a:p>', tMatch.index);
  if (pStart === -1 || pEndTagIndex === -1) {
    throw new Error(`Não consegui delimitar o parágrafo do placeholder (padrão: ${padraoPlaceholder}).`);
  }
  const pEnd = pEndTagIndex + '</a:p>'.length;
  const paragrafoOriginal = xml.slice(pStart, pEnd);

  const rPrMatch = paragrafoOriginal.match(/<a:rPr[^>]*(?:\/>|>.*?<\/a:rPr>)/);
  if (!rPrMatch) {
    throw new Error(`Não achei o rPr do placeholder (padrão: ${padraoPlaceholder}) pra reaproveitar a formatação.`);
  }
  const rPr = rPrMatch[0];

  const novoBloco = buildParagraphs(novoTexto, rPr);
  return xml.slice(0, pStart) + novoBloco + xml.slice(pEnd);
}

export async function gerarPropostaPptxBuffer(empresa: string, propostas: PropostaPptx[]): Promise<Buffer> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('Template docs/max/template-proposta.pptx não encontrado.');
  }
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);

  const slideFile = zip.file(SLIDE_PATH);
  if (!slideFile) throw new Error(`${SLIDE_PATH} não encontrado dentro do template.`);
  let xml = await slideFile.async('string');

  // Template só tem espaço pra 2 propostas nomeadas — se vier mais, usa só as 2 primeiras.
  const [prop1, prop2] = propostas;
  const texto1 = prop1 ? `${prop1.titulo}\n\n${prop1.corpo}` : ' ';
  const texto2 = prop2 ? `${prop2.titulo}\n\n${prop2.corpo}` : ' ';

  xml = substituirParagrafoPlaceholder(xml, 'x{50,}', texto1);
  xml = substituirParagrafoPlaceholder(xml, 'Xx{50,}', texto2);
  xml = xml.replace('<a:t>(nome da empresa)</a:t>', `<a:t>${escapeXml(empresa || 'Cliente')}</a:t>`);

  zip.file(SLIDE_PATH, xml);
  const resultado = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return resultado;
}
