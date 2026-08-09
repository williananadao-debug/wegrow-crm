import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const SYSTEM_PROMPT = `Você lê fotos de notas fiscais de fornecedores (compra de mercadoria) e extrai os dados em JSON.

Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto adicional, no formato:
{
  "fornecedor": "nome do fornecedor/emitente, ou null se não conseguir ler",
  "cnpj_fornecedor": "CNPJ do emitente só com dígitos (14 números), ou null",
  "numero": "número da nota fiscal (campo 'Nº' ou 'Número'), ou null",
  "serie": "série da nota fiscal (campo 'Série'), ou null",
  "chave_acesso": "chave de acesso da NF-e: 44 dígitos seguidos, sem espaço nem traço, geralmente perto do código de barras ou no topo do DANFE. Null se não conseguir ler os 44 dígitos com certeza.",
  "data_emissao": "data de emissão no formato AAAA-MM-DD, ou null",
  "valor_total": número (valor total da nota, ou null se não conseguir ler),
  "itens": [
    { "descricao": "nome do produto exatamente como está na nota", "quantidade": número, "valor_unitario": número }
  ]
}

Regras:
- quantidade e valor_unitario devem ser números (não string, sem "R$", usar ponto decimal)
- Se não conseguir ler algum item claramente, não o inclua
- itens pode ser um array vazio se não conseguir identificar nenhum item
- chave_acesso: só preencha se conseguir ler os 44 dígitos com confiança. Se estiver borrado/cortado, retorne null — não invente dígitos`;

export async function POST(req: NextRequest) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { data: { user: solicitante }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !solicitante) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }
  const { data: perfilSolicitante } = await supabaseAdmin
    .from('profiles')
    .select('empresa_id')
    .eq('id', solicitante.id)
    .single();
  if (!perfilSolicitante?.empresa_id) {
    return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });
  }

  try {
    const { imagemBase64 } = await req.json();
    if (!imagemBase64 || typeof imagemBase64 !== 'string' || !imagemBase64.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Imagem inválida.' }, { status: 400 });
    }

    const response = await groq.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      max_tokens: 3000,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Leia essa nota fiscal e extraia os dados no formato JSON pedido.' },
            { type: 'image_url', image_url: { url: imagemBase64 } },
          ] as any,
        },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '';

    let extraido: any = null;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      extraido = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return NextResponse.json({ error: 'Não consegui interpretar a nota. Tente uma foto mais nítida.' }, { status: 500 });
    }

    if (!extraido) {
      return NextResponse.json({ error: 'Não consegui ler nenhum dado dessa nota.' }, { status: 500 });
    }

    const itens = Array.isArray(extraido.itens)
      ? extraido.itens
          .filter((i: any) => i && i.descricao)
          .map((i: any) => ({
            descricao: String(i.descricao),
            quantidade: Number(i.quantidade) || 1,
            valor_unitario: Number(i.valor_unitario) || 0,
          }))
      : [];

    const somenteDigitos = (v: any) => typeof v === 'string' ? v.replace(/\D/g, '') : null;
    const chaveAcesso = somenteDigitos(extraido.chave_acesso);

    return NextResponse.json({
      fornecedor: extraido.fornecedor || null,
      cnpjFornecedor: somenteDigitos(extraido.cnpj_fornecedor) || null,
      numero: extraido.numero ? String(extraido.numero) : null,
      serie: extraido.serie ? String(extraido.serie) : null,
      chaveAcesso: chaveAcesso && chaveAcesso.length === 44 ? chaveAcesso : null,
      dataEmissao: extraido.data_emissao || null,
      valor_total: typeof extraido.valor_total === 'number' ? extraido.valor_total : null,
      itens,
    });

  } catch (err: any) {
    console.error('[Pulse Ler Nota] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao ler a nota.' }, { status: 500 });
  }
}
