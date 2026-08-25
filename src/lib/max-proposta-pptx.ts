import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

// Preenche o template docs/max/template-proposta.pptx (fornecido pelo Leo/IAlto). Um .pptx
// é um zip de XML (OOXML) — não existe biblioteca de "template filling" já usada neste repo
// (o padrão de PDF existente, contract-wegrow-pdf.ts, desenha tudo do zero com pdfkit; aqui
// é diferente: o slide já vem pronto, só troca o texto de placeholders específicos).
//
// Template v2 (9 slides, antes eram 8): slide7.xml tem Proposta 01/02 (com a caixa de
// saudação), slide8.xml tem Proposta 03/04 (sem saudação, é a página de continuação) e
// slide9.xml é o QR final. Cada slide de proposta tem, nessa ordem:
//   - "(nome da empresa)"                → nome do cliente, um <a:t> sozinho
//   - "Proposta 01:" / "Proposta 03:"    → rótulo estático, negrito herdado do template
//   - run de "x" minúsculo (340 chars)   → corpo da 1ª proposta do slide
//   - "Proposta 02: " / "Proposta 04: "  → rótulo estático (atenção: TERMINA COM ESPAÇO)
//   - run de "X" maiúsculo (340 chars)   → corpo da 2ª proposta do slide
// Quando há só 1 ou 2 propostas no total, o slide8 inteiro é removido do pacote (rels,
// sldId, Content_Types e as próprias partes) — não dá pra só deixar em branco, senão sobra
// uma página vazia entre a proposta e o QR.

export type PropostaPptx = { titulo: string; corpo: string };
export type ResultadoPptx = { buffer: Buffer; avisos: string[] };

const TEMPLATE_PATH = path.join(process.cwd(), 'docs', 'max', 'template-proposta.pptx');
const SLIDE7_PATH = 'ppt/slides/slide7.xml';
const SLIDE8_PATH = 'ppt/slides/slide8.xml';
const SLIDE8_RELS_PATH = 'ppt/slides/_rels/slide8.xml.rels';

const MAX_PROPOSTAS = 4;
const LIMITE_CARACTERES_CORPO = 1100; // ~14 linhas — acima disso a caixa do template estoura

const LABELS: [string, string] = ['Proposta 01:', 'Proposta 02: '];
const LABELS_SLIDE8: [string, string] = ['Proposta 03:', 'Proposta 04: '];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// O Max às vezes já manda o título com a numeração embutida ("PROPOSTA 01: Rádio + Digital")
// — como o rótulo "Proposta 0N:" já é fixo no template, concatenar sem limpar duplicaria
// ("Proposta 01: PROPOSTA 01: Rádio..."). Aceita variações de espaçamento/caixa/traço.
function limparPrefixoNumerado(titulo: string): string {
  return titulo.replace(/^\s*proposta\s*0*\d+\s*[:\-–]?\s*/i, '').trim();
}

function truncarCorpo(corpo: string, limite: number): { texto: string; cortado: boolean } {
  if (corpo.length <= limite) return { texto: corpo, cortado: false };
  // corta em espaço pra não partir palavra no meio
  const corte = corpo.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(' ');
  const texto = (ultimoEspaco > limite * 0.8 ? corte.slice(0, ultimoEspaco) : corte).trimEnd() + '…';
  return { texto, cortado: true };
}

// Substitui só o <a:t> do rótulo estático "Proposta 0N:"/"Proposta 0N: " (texto exato,
// não regex — evita qualquer risco de casar caractere especial). Concatena o título já
// limpo, normalizando o espaçamento (o 02/04 já vem com espaço no fim do rótulo).
function substituirLabel(xml: string, labelExato: string, tituloLimpo: string): string {
  const alvo = `<a:t>${escapeXml(labelExato)}</a:t>`;
  const idx = xml.indexOf(alvo);
  if (idx === -1) {
    throw new Error(`Rótulo "${labelExato}" não encontrado no template — o template-proposta.pptx pode ter sido editado/trocado.`);
  }
  const novoTexto = tituloLimpo ? `${labelExato.trimEnd()} ${escapeXml(tituloLimpo)}` : labelExato;
  return xml.slice(0, idx) + `<a:t>${novoTexto}</a:t>` + xml.slice(idx + alvo.length);
}

// Localiza o placeholder de corpo por POSIÇÃO (indexOf/lastIndexOf), não por uma regex
// genérica de ponta a ponta — um <a:rPr>...</a:rPr>.*? sem fronteira, quando falha no
// primeiro candidato, faz o motor de regex backtrackar e "engolir" parágrafos inteiros
// (inclusive texto já substituído), inflando o XML absurdamente. Isolar o <a:p>...</a:p>
// exato primeiro e só then extrair o rPr de dentro dele elimina esse risco.
function substituirCorpo(xml: string, padraoPlaceholder: string, texto: string): string {
  const tRe = new RegExp(`<a:t>${padraoPlaceholder}<\\/a:t>`);
  const tMatch = xml.match(tRe);
  if (!tMatch || tMatch.index === undefined) {
    throw new Error(`Placeholder de corpo não encontrado no template (padrão: ${padraoPlaceholder}).`);
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

  // Quebra de linha dentro do corpo é <a:br/>, não parágrafo novo — um único <a:p> com
  // vários <a:r> separados por <a:br/>.
  const linhas = texto.split('\n');
  const runs = linhas
    .map(linha => `<a:r>${rPr}<a:t>${linha.trim().length === 0 ? ' ' : escapeXml(linha)}</a:t></a:r>`)
    .join('<a:br/>');
  const novoBloco = `<a:p>${runs}</a:p>`;

  return xml.slice(0, pStart) + novoBloco + xml.slice(pEnd);
}

function preencherSlide(xml: string, empresa: string, labels: [string, string], slots: (PropostaPptx | null)[]): string {
  xml = xml.replace('<a:t>(nome da empresa)</a:t>', `<a:t>${escapeXml(empresa || 'Cliente')}</a:t>`);

  const [prop1, prop2] = slots;
  xml = substituirLabel(xml, labels[0], prop1 ? limparPrefixoNumerado(prop1.titulo) : '');
  xml = substituirCorpo(xml, 'x{100,}', prop1 ? prop1.corpo : ' ');

  xml = substituirLabel(xml, labels[1], prop2 ? limparPrefixoNumerado(prop2.titulo) : '');
  xml = substituirCorpo(xml, 'X[Xx]{100,}', prop2 ? prop2.corpo : ' ');

  return xml;
}

// Remove o slide8 inteiro do pacote (empresa com só 1 ou 2 propostas) — tira o
// <Relationship> de slides/slide8.xml do presentation.xml.rels, o <p:sldId>
// correspondente do presentation.xml, o <Override> do [Content_Types].xml, e apaga as
// partes slide8.xml e _rels/slide8.xml.rels. Não dá pra testar pela EXISTÊNCIA do
// slide8.xml pra decidir se o template tem 2ª página — no template antigo esse arquivo
// também existe (é o QR). Por isso quem chama essa função decide via contagem de
// propostas, não via inspeção do zip.
async function removerSlide8(zip: JSZip): Promise<void> {
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const relsFile = zip.file(relsPath);
  const presPath = 'ppt/presentation.xml';
  const presFile = zip.file(presPath);
  const contentTypesPath = '[Content_Types].xml';
  const contentTypesFile = zip.file(contentTypesPath);
  if (!relsFile || !presFile || !contentTypesFile) {
    throw new Error('Não consegui achar presentation.xml/.rels ou [Content_Types].xml pra remover o slide8.');
  }

  let relsXml = await relsFile.async('string');
  const relMatch = relsXml.match(/<Relationship[^>]*Target="slides\/slide8\.xml"[^>]*\/>/);
  if (!relMatch) throw new Error('Relationship do slide8.xml não encontrado em presentation.xml.rels.');
  const rId = relMatch[0].match(/Id="([^"]+)"/)?.[1];
  if (!rId) throw new Error('Não consegui extrair o r:id do slide8 em presentation.xml.rels.');
  relsXml = relsXml.replace(relMatch[0], '');

  let presXml = await presFile.async('string');
  const sldIdRe = new RegExp(`<p:sldId[^>]*r:id="${rId}"[^>]*\\/>`);
  const sldIdMatch = presXml.match(sldIdRe);
  if (!sldIdMatch) throw new Error(`<p:sldId> com r:id="${rId}" não encontrado em presentation.xml.`);
  presXml = presXml.replace(sldIdMatch[0], '');

  let contentTypesXml = await contentTypesFile.async('string');
  const overrideStr = '<Override PartName="/ppt/slides/slide8.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
  if (!contentTypesXml.includes(overrideStr)) throw new Error('Override do slide8.xml não encontrado em [Content_Types].xml.');
  contentTypesXml = contentTypesXml.replace(overrideStr, '');

  zip.file(relsPath, relsXml);
  zip.file(presPath, presXml);
  zip.file(contentTypesPath, contentTypesXml);
  zip.remove(SLIDE8_PATH);
  zip.remove(SLIDE8_RELS_PATH);
}

export async function gerarPropostaPptxBuffer(
  empresa: string,
  propostasEntrada: PropostaPptx[],
  vendedorContato?: string
): Promise<ResultadoPptx> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('Template docs/max/template-proposta.pptx não encontrado.');
  }
  const avisos: string[] = [];

  let propostas = propostasEntrada;
  if (propostas.length > MAX_PROPOSTAS) {
    avisos.push(`Foram enviadas ${propostas.length} propostas — o modelo só comporta ${MAX_PROPOSTAS}. Usando só as ${MAX_PROPOSTAS} primeiras, avise o vendedor.`);
    propostas = propostas.slice(0, MAX_PROPOSTAS);
  }

  // Contato do vendedor entra no fim do corpo da ÚLTIMA proposta preenchida.
  propostas = propostas.map((p, i) => {
    let corpo = p.corpo;
    const { texto, cortado } = truncarCorpo(corpo, LIMITE_CARACTERES_CORPO);
    corpo = texto;
    if (cortado) avisos.push(`Proposta ${i + 1} ("${p.titulo}") passou do espaço da caixa (~${LIMITE_CARACTERES_CORPO} caracteres) e foi cortada.`);
    if (i === propostas.length - 1 && vendedorContato) {
      corpo = `${corpo}\n\n${vendedorContato}`;
    }
    return { ...p, corpo };
  });

  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);

  const usarSlide8 = propostas.length > 2;

  const slide7File = zip.file(SLIDE7_PATH);
  if (!slide7File) throw new Error(`${SLIDE7_PATH} não encontrado dentro do template.`);
  let xml7 = await slide7File.async('string');
  xml7 = preencherSlide(xml7, empresa, LABELS, [propostas[0] ?? null, propostas[1] ?? null]);
  zip.file(SLIDE7_PATH, xml7);

  if (usarSlide8) {
    const slide8File = zip.file(SLIDE8_PATH);
    if (!slide8File) throw new Error(`${SLIDE8_PATH} não encontrado dentro do template.`);
    let xml8 = await slide8File.async('string');
    xml8 = preencherSlide(xml8, empresa, LABELS_SLIDE8, [propostas[2] ?? null, propostas[3] ?? null]);
    zip.file(SLIDE8_PATH, xml8);
  } else {
    await removerSlide8(zip);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, avisos };
}
