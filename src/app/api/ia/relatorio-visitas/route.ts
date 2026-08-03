import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const SYSTEM_PROMPT = `Você é um estrategista de vendas especializado em analisar comentários de visitas comerciais em campo (rádio/mídia local).
Analise as observações de visita listadas e categorize os sinais encontrados, pra servir de munição prática pro time de vendas numa negociação.

REGRAS:
- Retorne APENAS um objeto JSON válido, sem markdown, sem texto adicional.
- Formato exato:
{
  "resumo_executivo": "2-3 frases diretas resumindo o panorama geral encontrado nas visitas",
  "sinais_compra": [ { "cliente": "nome da empresa", "sinal": "descrição curta do sinal de compra identificado", "comentario_origem": "trecho literal do comentário que embasa" } ],
  "objecoes": [ { "padrao": "nome do padrão de objeção", "ocorrencias": numero_de_vezes_que_aparece, "exemplo": "trecho literal de exemplo" } ],
  "risco_perda": [ { "cliente": "nome da empresa", "motivo": "descrição do risco/insatisfação identificado", "comentario_origem": "trecho literal" } ]
}
- Só inclua um item se houver evidência real no texto do comentário — não invente nem generalize sem base.
- Se uma categoria não tiver nenhum resultado, retorne array vazio para ela.
- Seja direto e acionável, não genérico. O objetivo é munição prática, não um relatório burocrático.
- "ocorrencias" deve ser um número inteiro, não string.

Responda SOMENTE com o objeto JSON.`;

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
  const empresa_id = perfilSolicitante.empresa_id;

  try {
    const body = await req.json();
    const visitaIds: number[] = Array.isArray(body.visitaIds) ? body.visitaIds : [];
    if (visitaIds.length === 0) {
      return NextResponse.json({ error: 'Nenhuma visita selecionada.' }, { status: 400 });
    }

    // Busca as visitas direto do banco (nunca confia em dados de visita vindos do corpo da
    // requisição) — sempre filtrando pela empresa do solicitante.
    const { data: visitas, error: visitasError } = await supabaseAdmin
      .from('visitas')
      .select('empresa, cidade, observacao, created_at')
      .eq('empresa_id', empresa_id)
      .in('id', visitaIds)
      .not('observacao', 'is', null)
      .limit(100);

    if (visitasError) throw new Error('Erro ao buscar visitas: ' + visitasError.message);

    const comObservacao = (visitas || []).filter(v => (v.observacao || '').trim().length > 0);
    if (comObservacao.length === 0) {
      return NextResponse.json({ error: 'Nenhuma das visitas selecionadas tem observação registrada pra analisar.' }, { status: 400 });
    }

    const listaVisitas = comObservacao.slice(0, 80).map(v =>
      `- [${v.empresa}${v.cidade ? ` / ${v.cidade}` : ''}, ${new Date(v.created_at).toLocaleDateString('pt-BR')}]: "${v.observacao}"`
    ).join('\n');

    const userPrompt = `TOTAL DE VISITAS COM OBSERVAÇÃO A ANALISAR: ${comObservacao.length}

VISITAS:
${listaVisitas}`;

    const response = await groq.chat.completions.create({
      model: 'gemma2-9b-it',
      max_tokens: 3000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '';

    let relatorio: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      relatorio = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      relatorio = null;
    }

    if (!relatorio) {
      return NextResponse.json({ error: 'Erro ao interpretar resposta da IA.', raw: rawText }, { status: 500 });
    }

    return NextResponse.json({
      relatorio,
      visitasAnalisadas: comObservacao.length,
    });

  } catch (err: any) {
    console.error('[IA Relatório Visitas] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
