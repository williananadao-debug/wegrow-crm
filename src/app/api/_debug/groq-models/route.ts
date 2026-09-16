import { NextRequest, NextResponse } from 'next/server';

// Rota temporária de diagnóstico — lista os modelos que a chave GROQ_API_KEY em produção
// realmente tem acesso (documentação da Groq mostrou nomes que não existem de verdade,
// então checando direto na fonte). Remover depois de identificar o modelo de visão certo.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== 'wegrow-temp-debug-2026') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  const json = await res.json();
  if (json.error) return NextResponse.json(json, { status: res.status });
  const ids = (json.data || []).map((m: { id: string }) => m.id).sort();
  return NextResponse.json({ count: ids.length, ids });
}
