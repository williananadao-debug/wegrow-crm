import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import { buscarContratacoesPncp, filtrarPorPalavrasChave, formatarDataPncp } from '@/lib/pncp';

export const maxDuration = 60; // ferramenta buscar_pncp chama a API instável do PNCP (ver src/lib/pncp.ts)

const SYSTEM_PROMPT = `Você é o Agente Argus, assistente de IA especializado em licitações públicas dentro do sistema WeGrow.

O que você sabe fazer:
1. listar_editais — listar os editais que a empresa já está acompanhando (filtrando por status ou órgão).
2. detalhar_edital — trazer o detalhe completo de um edital específico (situação financeira, alertas, linha do tempo).
3. buscar_pncp — fazer uma busca AO VIVO no Portal Nacional de Contratações Públicas (PNCP) por UF/modalidade/palavra-chave, quando o usuário perguntar sobre editais que ainda não estão salvos no sistema.
4. resumo_financeiro — trazer os números consolidados (receita, taxa de êxito, valor em disputa, pagamentos em atraso).
5. listar_alertas — listar alertas ativos (ex: prazos vencendo).

Regras importantes:
- Nunca invente números — sempre use as ferramentas pra buscar dados reais antes de responder qualquer pergunta sobre editais, valores ou prazos.
- Nunca calcule totais/médias você mesmo no texto — os valores que resumo_financeiro devolve já vêm calculados pelo servidor; repita-os, não refaça a conta.
- Seja direto, converse em português, sem enrolação.`;

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'listar_editais',
      description: 'Lista os editais já acompanhados pela empresa no Argus.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['candidato', 'acompanhando', 'proposta_enviada', 'ganho', 'perdido', 'arquivado'] },
          orgao: { type: 'string', description: 'filtro parcial pelo nome do órgão' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detalhar_edital',
      description: 'Traz o detalhe completo de um edital: dados, situação financeira, alertas e linha do tempo.',
      parameters: { type: 'object', properties: { edital_id: { type: 'integer' } }, required: ['edital_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_pncp',
      description: 'Busca AO VIVO no PNCP por editais que ainda não estão salvos no sistema.',
      parameters: {
        type: 'object',
        properties: {
          uf: { type: 'string', description: 'sigla do estado, ex: SC' },
          modalidade: { type: 'integer', description: 'código da modalidade PNCP — 6 = Pregão Eletrônico (padrão se não especificado)' },
          palavra_chave: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumo_financeiro',
      description: 'Traz os números financeiros consolidados: receita do mês, taxa de êxito, valor em disputa, pagamentos em atraso.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_alertas',
      description: 'Lista alertas ativos (não resolvidos) de todos os editais.',
      parameters: { type: 'object', properties: { severidade: { type: 'string', enum: ['vermelho', 'amber', 'verde'] } } },
    },
  },
];

// Retry/backoff — mesma disciplina já usada no agente Max (src/app/api/max/chat/route.ts),
// portada pro shape de erro do SDK do Groq (lança Groq.APIError em vez de devolver
// uma Response não-ok como o fetch cru do Max).
async function chatComRetry(groq: Groq, params: any): Promise<Groq.Chat.Completions.ChatCompletion> {
  try {
    return await groq.chat.completions.create(params);
  } catch (err: any) {
    if (err?.status === 429) {
      const retryAfter = err?.headers?.['retry-after'];
      const esperaMs = Math.min(retryAfter ? Number(retryAfter) * 1000 : 2000, 8000);
      await new Promise(r => setTimeout(r, esperaMs));
      return groq.chat.completions.create(params);
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY não configurada.' }, { status: 503 });
  }
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user: solicitante }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !solicitante) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  const { data: perfilSolicitante } = await supabaseAdmin.from('profiles').select('empresa_id').eq('id', solicitante.id).single();
  if (!perfilSolicitante?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });
  const empresaId = perfilSolicitante.empresa_id;

  try {
    const { mensagens } = await req.json();
    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return NextResponse.json({ error: 'Nenhuma mensagem enviada.' }, { status: 400 });
    }

    const historico: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...mensagens,
    ];

    const primeira = await chatComRetry(groq, {
      model: 'openai/gpt-oss-120b',
      max_tokens: 1500,
      temperature: 0.3,
      reasoning_effort: 'low',
      include_reasoning: false,
      messages: historico,
      tools: TOOLS,
    });

    const respostaMsg = primeira.choices[0]?.message;
    const toolCalls = respostaMsg?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json({ resposta: respostaMsg?.content || '' });
    }

    historico.push(respostaMsg as any);

    for (const call of toolCalls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments); } catch {}
      let resultado: any = { erro: 'Ferramenta desconhecida.' };

      if (call.function.name === 'listar_editais') {
        let q = supabaseAdmin.from('argus_editais').select('id, orgao, objeto, status_interesse, valor_estimado, data_sessao').eq('empresa_id', empresaId);
        if (args.status) q = q.eq('status_interesse', args.status);
        if (args.orgao) q = q.ilike('orgao', `%${args.orgao}%`);
        const { data } = await q.order('created_at', { ascending: false }).limit(30);
        resultado = { editais: data || [] };
      } else if (call.function.name === 'detalhar_edital') {
        const [{ data: edital }, { data: alertas }, { data: eventos }] = await Promise.all([
          supabaseAdmin.from('argus_editais').select('*').eq('id', args.edital_id).eq('empresa_id', empresaId).single(),
          supabaseAdmin.from('argus_edital_alertas').select('*').eq('edital_id', args.edital_id).eq('resolvido', false),
          supabaseAdmin.from('argus_edital_eventos').select('*').eq('edital_id', args.edital_id).order('data_evento', { ascending: false }).limit(10),
        ]);
        resultado = edital ? { edital, alertas, eventos } : { erro: 'Edital não encontrado.' };
      } else if (call.function.name === 'buscar_pncp') {
        try {
          const hoje = new Date();
          const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 30);
          const r = await buscarContratacoesPncp({
            dataInicial: formatarDataPncp(inicio), dataFinal: formatarDataPncp(hoje),
            modalidade: args.modalidade || 6, uf: args.uf || null, pagina: 1, tamanhoPagina: 20,
          });
          const filtrados = filtrarPorPalavrasChave(r.data, args.palavra_chave);
          resultado = { total_encontrado: r.totalRegistros, resultados: filtrados.slice(0, 10) };
        } catch (e: any) {
          resultado = { erro: `Erro ao consultar o PNCP: ${e.message}` };
        }
      } else if (call.function.name === 'resumo_financeiro') {
        const { data: editais } = await supabaseAdmin.from('argus_editais').select('status_interesse, valor_estimado, valor_homologado, valor_proposto, updated_at').eq('empresa_id', empresaId);
        const lista = editais || [];
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
        // Nunca confia na conta que o modelo faria — recalcula tudo aqui no servidor.
        const receitaMes = lista.filter(e => e.status_interesse === 'ganho' && new Date(e.updated_at) >= inicioMes)
          .reduce((acc, e) => acc + Number(e.valor_homologado || e.valor_proposto || 0), 0);
        const finalizados = lista.filter(e => ['ganho', 'perdido'].includes(e.status_interesse));
        const ganhos = lista.filter(e => e.status_interesse === 'ganho');
        const taxaExito = finalizados.length > 0 ? Math.round((ganhos.length / finalizados.length) * 100) : 0;
        const valorEmDisputa = lista.filter(e => ['candidato', 'acompanhando', 'proposta_enviada'].includes(e.status_interesse))
          .reduce((acc, e) => acc + Number(e.valor_estimado || 0), 0);
        resultado = { receita_mes: receitaMes, taxa_exito_percent: taxaExito, valor_em_disputa: valorEmDisputa, total_editais: lista.length };
      } else if (call.function.name === 'listar_alertas') {
        let q = supabaseAdmin.from('argus_edital_alertas').select('id, edital_id, severidade, mensagem').eq('empresa_id', empresaId).eq('resolvido', false);
        if (args.severidade) q = q.eq('severidade', args.severidade);
        const { data } = await q.limit(30);
        resultado = { alertas: data || [] };
      }

      historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(resultado) });
    }

    const segunda = await chatComRetry(groq, {
      model: 'openai/gpt-oss-120b',
      max_tokens: 1000,
      temperature: 0.3,
      reasoning_effort: 'low',
      include_reasoning: false,
      messages: historico,
    });

    return NextResponse.json({ resposta: segunda.choices[0]?.message?.content || '' });
  } catch (err: any) {
    console.error('[Argus Agente Chat] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
