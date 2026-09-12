"use client";

// Converte a 1ª página de um PDF (DANFE) numa imagem PNG — o jeito de reaproveitar o
// MESMO pipeline de leitura por IA que já existe pra foto (POST /api/pulse/ler-nota
// só aceita image_url, não teria como mandar o PDF cru pro modelo). pdfjs-dist é
// importado sob demanda (só quando alguém escolhe "PDF" no lançamento de nota) pra não
// pesar o bundle de quem nunca usa essa opção.
//
// O worker do pdf.js roda numa CDN em vez de ser empacotado pelo Next — evita a dor de
// cabeça de apontar o webpack pro arquivo .worker dentro de node_modules; a versão na
// URL tem que bater exatamente com a versão instalada (ver package.json).
export async function renderizarPrimeiraPaginaPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pagina = await pdf.getPage(1);

  // Escala 2x — DANFE tem letra miúda (CFOP, NCM, chave de acesso); resolução baixa
  // demais faz a IA errar dígito na leitura.
  const viewport = pagina.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const contexto = canvas.getContext('2d');
  if (!contexto) throw new Error('Não foi possível preparar a conversão do PDF.');

  await pagina.render({ canvasContext: contexto, viewport }).promise;
  return canvas.toDataURL('image/png');
}
