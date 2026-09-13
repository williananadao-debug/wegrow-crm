import { supabase } from './supabase';

// Sobe o arquivo original da nota (foto, PDF ou XML) pro Storage — é o que dá ao botão
// "Abrir NF" (no Kardex do Estoque, em /pulse/estoque) algo de verdade pra abrir. Antes
// disso, nota lançada por foto/PDF/XML/manual só guardava os dados extraídos (número,
// itens, valor) e nunca o arquivo em si — só notas capturadas via Focus NFe tinham link.
// Falha de upload não derruba o lançamento da nota (o arquivo é um extra, não o dado
// principal) — só retorna null e quem chamou segue sem o link.
export async function uploadArquivoNotaFiscal(empresaId: string, arquivo: Blob, extensao: string): Promise<string | null> {
  try {
    const path = `${empresaId}/${Date.now()}.${extensao}`;
    const { error } = await supabase.storage.from('notas-fiscais').upload(path, arquivo, { upsert: false, contentType: arquivo.type || undefined });
    if (error) { console.error('[uploadArquivoNotaFiscal]', error); return null; }
    const { data } = supabase.storage.from('notas-fiscais').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('[uploadArquivoNotaFiscal]', err);
    return null;
  }
}

export function base64ParaBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
