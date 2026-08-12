import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const SYSTEM_PROMPT = `Você é a THOR, assistente de IA de vendas dentro do sistema WeGrow.

O que você sabe fazer hoje:
1. Gerar uma leva de leads de reativação usando a ferramenta gerar_estrategia_ia — pra resgatar clientes inativos, prevenir perda de contrato (churn) que está vencendo, ou sugerir primeira compra (mix) pra quem nunca comprou. Use essa ferramenta sempre que o usuário pedir algo do tipo "quem eu deveria contatar", "tem cliente parado", "contratos vencendo", "lista de clientes novos pra abordar".
2. Ler nota fiscal de fornecedor por foto e dar entrada no estoque + lançar a despesa em Contas a Pagar — isso é feito pelo botão de anexar foto (ícone de câmera) ao lado do campo de mensagem, não por texto. Se o usuário disser que quer dar entrada de nota fiscal ou mercadoria, oriente a usar o botão de anexar foto.
3. Gerar um catálogo de vendas profissional (pronto pra imprimir/exportar em PDF) a partir do catálogo de produtos já cadastrado — use a ferramenta gerar_material_vendas quando o usuário pedir "material de vendas", "catálogo", "folder", "algo pra mostrar/imprimir pro cliente".

Seja direto, converse em português, sem enrolação e sem inventar números que você não tem — só fale de resultados reais depois que uma ferramenta rodar de fato.`;

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'gerar_estrategia_ia',
      description: 'Gera e cria automaticamente uma lista de leads de reativação de vendas, com sugestão de produtos pra cada um, direto no funil.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['resgate', 'churn', 'mix'], description: 'resgate = clientes que compraram antes e sumiram; churn = contratos vencendo nos próximos 90 dias; mix = clientes cadastrados que nunca compraram' },
          limite: { type: 'integer', description: 'quantos leads gerar, no máximo. Padrão 10 se o usuário não falar.' },
          produto_foco: { type: 'string', description: 'nome de um produto do catálogo pra focar a sugestão, se o usuário mencionar um específico' },
        },
        required: ['tipo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerar_material_vendas',
      description: 'Confirma que a empresa tem catálogo de produtos cadastrado e libera o catálogo de vendas pronto pra imprimir/exportar em PDF.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

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
    const { mensagens } = await req.json();
    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return NextResponse.json({ error: 'Nenhuma mensagem enviada.' }, { status: 400 });
    }

    const historico: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...mensagens,
    ];

    const primeira = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      temperature: 0.3,
      messages: historico,
      tools: TOOLS,
    });

    const respostaMsg = primeira.choices[0]?.message;
    const toolCalls = respostaMsg?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json({ resposta: respostaMsg?.content || '' });
    }

    historico.push(respostaMsg as any);

    let resultadoEstrategia: { count: number; leads?: any[]; message?: string } | null = null;
    let materialGerado = false;

    for (const call of toolCalls) {
      if (call.function.name === 'gerar_estrategia_ia') {
        let args: any = {};
        try { args = JSON.parse(call.function.arguments); } catch {}

        const origem = req.nextUrl.origin;
        const res = await fetch(`${origem}/api/ia/estrategia`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify({
            tipo: args.tipo, limite: args.limite || 10, produto_foco: args.produto_foco || null,
            vendedor_id: null, dias_inativo: null, criado_por: solicitante.id,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ erro: json.error || 'Erro ao gerar estratégia.' }) });
        } else {
          resultadoEstrategia = json;
          historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(json) });
        }
      } else if (call.function.name === 'gerar_material_vendas') {
        const { count } = await supabaseAdmin
          .from('servicos')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', perfilSolicitante.empresa_id);
        if (!count || count === 0) {
          historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, erro: 'Nenhum produto cadastrado ainda — cadastre o catálogo em Configurações antes de gerar o material.' }) });
        } else {
          materialGerado = true;
          historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true, totalProdutos: count }) });
        }
      } else {
        historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ erro: 'Ferramenta desconhecida.' }) });
      }
    }

    const segunda = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      temperature: 0.3,
      messages: historico,
    });

    return NextResponse.json({
      resposta: segunda.choices[0]?.message?.content || '',
      leadsGerados: resultadoEstrategia?.count || 0,
      materialGerado,
    });

  } catch (err: any) {
    console.error('[THOR Chat] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
