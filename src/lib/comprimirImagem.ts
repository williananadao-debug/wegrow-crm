// Reduz foto de celular antes do upload: lado maior até `maxLado` px, JPEG `qualidade`.
// Foto de iPhone vem com 3–8 MB (às vezes HEIC, que o Chrome nem mostra) — em rede de
// celular no chão de fábrica o upload ficava lento e caía ("Load failed" no Safari).
// Se o navegador não conseguir decodificar a imagem, devolve o arquivo original.
export async function comprimirImagem(file: File, maxLado = 1600, qualidade = 0.8): Promise<File> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    URL.revokeObjectURL(url);

    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const largura = Math.round(img.naturalWidth * escala);
    const altura = Math.round(img.naturalHeight * escala);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, largura, altura);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', qualidade));
    // Só troca se ficou menor (PNG pequeno/print pode crescer ao virar JPEG).
    if (!blob || (blob.size >= file.size && file.type === 'image/jpeg')) return file;
    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
