import { NextRequest, NextResponse } from 'next/server';

// Rota temporária de diagnóstico — lista os modelos que a chave GROQ_API_KEY em produção
// realmente tem acesso (documentação da Groq mostrou nomes que não existem de verdade,
// então checando direto na fonte). Remover depois de identificar o modelo de visão certo.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== 'wegrow-temp-debug-2026') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const testarVisao = req.nextUrl.searchParams.get('testar_visao');
  if (testarVisao) {
    // Imagem PNG 1x1 branca — só pra ver se o modelo aceita image_url sem 400/404, não
    // importa o que ele "vê".
    const pixelBranco = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mNk+P+/noGBgYGBiYGBAAAQCgQBBYSyeQAAAABJRU5ErkJggg==';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: testarVisao,
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'O que você vê?' },
            { type: 'image_url', image_url: { url: pixelBranco } },
          ],
        }],
      }),
    });
    const json = await res.json();
    return NextResponse.json({ status: res.status, json });
  }

  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  const json = await res.json();
  if (json.error) return NextResponse.json(json, { status: res.status });
  const ids = (json.data || []).map((m: { id: string }) => m.id).sort();
  return NextResponse.json({ count: ids.length, ids });
}
