// Extração de cor dominante de uma imagem (logo) — 100% client-side via canvas, sem
// API/serviço externo. Ideia: desenha a imagem num canvas, lê os pixels, agrupa por
// "bucket" de cor (arredondando cada canal) e devolve o bucket mais frequente entre os
// pixels que não são quase-branco/quase-preto/transparente (que normalmente são o fundo
// da logo, não a cor de marca de verdade).
export async function extrairCorDominante(imgUrl: string): Promise<string | null> {
  try {
    const img = await carregarImagem(imgUrl);
    const canvas = document.createElement('canvas');
    const tamanho = 64; // reduz a imagem antes de ler pixel a pixel — rápido e suficiente pra cor dominante
    canvas.width = tamanho;
    canvas.height = tamanho;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, tamanho, tamanho);

    const { data } = ctx.getImageData(0, 0, tamanho, tamanho);
    const contagem = new Map<string, { r: number; g: number; b: number; qtd: number }>();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue; // pixel transparente, ignora
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const luminancia = (max + min) / 2;
      const saturacao = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
      if (luminancia > 235 || luminancia < 20) continue; // quase-branco ou quase-preto: normalmente fundo/texto neutro
      if (saturacao < 0.15) continue; // cinza puro, não é uma cor de marca reconhecível

      // Bucket de 24 em 24 (agrupa tons próximos) pra contagem não ficar pulverizada
      // pixel a pixel — sem isso, quase nenhum bucket repete e "o mais frequente" vira ruído.
      const chave = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
      const atual = contagem.get(chave);
      if (atual) { atual.qtd++; } else { contagem.set(chave, { r, g, b, qtd: 1 }); }
    }

    if (contagem.size === 0) return null;
    const dominante = Array.from(contagem.values()).sort((a, b) => b.qtd - a.qtd)[0];
    return rgbParaHex(dominante.r, dominante.g, dominante.b);
  } catch {
    return null;
  }
}

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function rgbParaHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
