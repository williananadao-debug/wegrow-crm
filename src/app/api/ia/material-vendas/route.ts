import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Validate JWT and get empresa_id from profile (never trust the request)
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
  const empresaId = perfilSolicitante.empresa_id;

  try {
    const { data: empresa } = await supabaseAdmin
      .from('empresas')
      .select('nome, logo_url')
      .eq('id', empresaId)
      .single();

    const { data: servicos } = await supabaseAdmin
      .from('servicos')
      .select('nome, preco, tipo, imagem_url, produto_pai_id')
      .eq('empresa_id', empresaId)
      .order('nome', { ascending: true });

    if (!servicos || servicos.length === 0) {
      return NextResponse.json({ error: 'Nenhum produto cadastrado ainda.' }, { status: 400 });
    }

    // Mesmo agrupamento pai→variantes já usado em Settings (produto_pai_id/variante_nome) —
    // mantém a variante logo depois do produto base em vez de espalhada pela lista.
    const paisEAvulsos = servicos.filter((s: any) => !s.produto_pai_id);
    const porPai: Record<string, any[]> = {};
    servicos.filter((s: any) => s.produto_pai_id).forEach((s: any) => {
      const chave = String(s.produto_pai_id);
      (porPai[chave] ||= []).push(s);
    });
    const servicosOrdenados = paisEAvulsos.flatMap((p: any) => [p, ...(porPai[String((p as any).id)] || [])]);

    const categoriasMap = new Map<string, { nome: string; preco: number; imagem_url: string | null }[]>();
    servicosOrdenados.forEach((s: any) => {
      const cat = s.tipo || 'Catálogo';
      if (!categoriasMap.has(cat)) categoriasMap.set(cat, []);
      categoriasMap.get(cat)!.push({ nome: s.nome, preco: Number(s.preco) || 0, imagem_url: s.imagem_url || null });
    });
    const categorias = Array.from(categoriasMap.entries()).map(([nome, produtos]) => ({ nome, produtos }));

    let intro = '';
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const nomesCategorias = categorias.map(c => c.nome).join(', ');
      const resp = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: 'Você escreve um parágrafo curto (2 a 3 frases) de abertura pra um catálogo de vendas profissional em português do Brasil. Tom confiante e direto, sem clichê vazio. NUNCA invente número, preço, ano de fundação ou qualquer especificação de produto que não foi te dado — fale de forma genérica sobre o portfólio, sem inventar fato específico.',
          },
          {
            role: 'user',
            content: `Empresa: ${empresa?.nome || 'a empresa'}\nCategorias do catálogo: ${nomesCategorias || 'produtos e serviços'}\n\nEscreva o parágrafo de abertura do catálogo.`,
          },
        ],
      });
      intro = resp.choices[0]?.message?.content?.trim() || '';
    } catch (err) {
      console.error('[material-vendas] erro ao gerar intro:', err);
      // Segue sem o texto de abertura — o catálogo ainda é útil só com produtos/preços.
    }

    return NextResponse.json({
      empresaNome: empresa?.nome || '',
      logoUrl: empresa?.logo_url || null,
      intro,
      categorias,
    });
  } catch (err: any) {
    console.error('[material-vendas] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
