import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const SYSTEM_PROMPT = `Você é um estrategista de vendas especializado em analisar comentários de visitas comerciais em campo (rádio/mídia local).
Analise o histórico de observações por cliente listado abaixo e categorize os sinais encontrados, pra servir de munição prática pro time de vendas numa negociação.

REGRAS:
- Retorne APENAS um objeto JSON válido, sem markdown, sem texto adicional.
- Formato exato:
{
  "resumo_executivo": "2-3 frases diretas resumindo o panorama geral encontrado nas visitas, como se fosse um briefing pro diretor comercial",
  "sinais_compra": [ { "cliente": "nome exato da empresa como aparece na lista", "sinal": "descrição curta do sinal de compra identificado", "comentario_origem": "trecho literal do comentário que embasa", "recomendacao": "próximo passo prático e específico pro vendedor tomar com esse cliente" } ],
  "objecoes": [ { "padrao": "nome do padrão de objeção", "ocorrencias": numero_de_vezes_que_aparece, "exemplo": "trecho literal de exemplo", "recomendacao": "contra-argumento ou abordagem sugerida pra contornar essa objeção" } ],
  "risco_perda": [ { "cliente": "nome exato da empresa como aparece na lista", "motivo": "descrição do risco/insatisfação identificado", "comentario_origem": "trecho literal", "recomendacao": "ação de retenção sugerida, com urgência se for o caso" } ]
}
- Use o campo "cliente" com o nome EXATO da empresa como está escrito na lista de entrada, sem alterar, resumir ou traduzir — isso é usado depois pra cruzar com outros dados.
- Só inclua um item se houver evidência real no texto do comentário — não invente nem generalize sem base.
- Se um cliente tem várias visitas/comentários no histórico, considere a evolução entre elas (ex: objeção que já foi superada, sinal de compra que esfriou).
- Se uma categoria não tiver nenhum resultado, retorne array vazio para ela.
- Seja direto e acionável, não genérico. O objetivo é munição prática, não um relatório burocrático.
- "ocorrencias" deve ser um número inteiro, não string.

Responda SOMENTE com o objeto JSON.`;

type ItemComCliente = { cliente: string; recomendacao?: string; [k: string]: unknown };

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
      .limit(150);

    if (visitasError) throw new Error('Erro ao buscar visitas: ' + visitasError.message);

    const comObservacao = (visitas || []).filter(v => (v.observacao || '').trim().length > 0);
    if (comObservacao.length === 0) {
      return NextResponse.json({ error: 'Nenhuma das visitas selecionadas tem observação registrada pra analisar.' }, { status: 400 });
    }

    // Agrupa por cliente (em vez de mandar visitas soltas) — dá pra IA ver o histórico
    // completo de cada cliente de uma vez, não comentários isolados sem contexto.
    const porCliente = new Map<string, { cidade: string; visitas: { data: string; observacao: string }[] }>();
    for (const v of comObservacao.slice(0, 120)) {
      const chave = v.empresa;
      if (!porCliente.has(chave)) porCliente.set(chave, { cidade: v.cidade || '', visitas: [] });
      const entry = porCliente.get(chave)!;
      if (!entry.cidade && v.cidade) entry.cidade = v.cidade;
      entry.visitas.push({ data: new Date(v.created_at).toLocaleDateString('pt-BR'), observacao: v.observacao! });
    }

    const cidadePorCliente = new Map<string, string>();
    porCliente.forEach((v, cliente) => { if (v.cidade) cidadePorCliente.set(normalizarNome(cliente), v.cidade); });

    const listaClientes = Array.from(porCliente.entries()).map(([cliente, info]) => {
      const historico = info.visitas.map(v => `  [${v.data}] "${v.observacao}"`).join('\n');
      return `CLIENTE: ${cliente}${info.cidade ? ` (${info.cidade})` : ''}\n${historico}`;
    }).join('\n\n');

    const userPrompt = `TOTAL DE CLIENTES COM OBSERVAÇÃO A ANALISAR: ${porCliente.size} (${comObservacao.length} visitas no total)

${listaClientes}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4000,
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

    // Cruza os clientes identificados pela IA com a cidade real (dado determinístico, não
    // vem da IA) pra montar um raio-x de concentração regional de oportunidade x risco.
    const regioes = new Map<string, { oportunidades: number; riscos: number }>();
    const anexarCidade = (item: ItemComCliente, tipo: 'oportunidades' | 'riscos') => {
      const cidade = cidadePorCliente.get(normalizarNome(item.cliente || ''));
      if (!cidade) return;
      item.cidade = cidade;
      if (!regioes.has(cidade)) regioes.set(cidade, { oportunidades: 0, riscos: 0 });
      regioes.get(cidade)![tipo]++;
    };
    (relatorio.sinais_compra || []).forEach((i: ItemComCliente) => anexarCidade(i, 'oportunidades'));
    (relatorio.risco_perda || []).forEach((i: ItemComCliente) => anexarCidade(i, 'riscos'));

    relatorio.concentracao_regional = Array.from(regioes.entries())
      .map(([cidade, v]) => ({ cidade, ...v }))
      .sort((a, b) => (b.oportunidades + b.riscos) - (a.oportunidades + a.riscos));

    return NextResponse.json({
      relatorio,
      visitasAnalisadas: comObservacao.length,
      clientesAnalisados: porCliente.size,
    });

  } catch (err: any) {
    console.error('[IA Relatório Visitas] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}

function normalizarNome(nome: string) {
  return nome.trim().toLowerCase();
}
