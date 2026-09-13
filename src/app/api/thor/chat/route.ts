import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import { calcularAlertasReposicao } from '@/lib/estoqueInteligente';

// Mesmo padrão do ETAPAS_FABRICACAO_PADRAO em pulse/shared.ts, copiado aqui em vez de
// importado — shared.ts também instancia o client Supabase de browser (anon key) no
// module-level, e evitar puxar isso pra dentro de uma rota de servidor é mais seguro do
// que confirmar que não tem efeito colateral nenhum.
const ETAPAS_FABRICACAO_PADRAO = ['Corte', 'Solda/Estrutura', 'Pintura', 'Montagem/Acabamento'];
function etapasFabricacaoDe(modulos: Record<string, any> | null | undefined): string[] {
  const custom = modulos?.pulse_etapas_fabricacao;
  return Array.isArray(custom) && custom.length > 0 ? custom : ETAPAS_FABRICACAO_PADRAO;
}

const SYSTEM_PROMPT = `Você é a THOR, assistente de IA de gestão dentro do sistema WeGrow.

O que você sabe fazer hoje:
1. Gerar uma leva de leads de reativação usando a ferramenta gerar_estrategia_ia — pra resgatar clientes inativos, prevenir perda de contrato (churn) que está vencendo, ou sugerir primeira compra (mix) pra quem nunca comprou. Use essa ferramenta sempre que o usuário pedir algo do tipo "quem eu deveria contatar", "tem cliente parado", "contratos vencendo", "lista de clientes novos pra abordar".
2. Ler nota fiscal de fornecedor por foto e dar entrada no estoque + lançar a despesa em Contas a Pagar — isso é feito pelo botão de anexar foto (ícone de câmera) ao lado do campo de mensagem, não por texto. Se o usuário disser que quer dar entrada de nota fiscal ou mercadoria, oriente a usar o botão de anexar foto.
3. Gerar um catálogo de vendas profissional (pronto pra imprimir/exportar em PDF) a partir do catálogo de produtos já cadastrado — use a ferramenta gerar_material_vendas quando o usuário pedir "material de vendas", "catálogo", "folder", "algo pra mostrar/imprimir pro cliente".
4. Analisar o estoque atual (ferramenta analisar_estoque) — valor total parado, itens abaixo do mínimo, itens que não saem há semanas (parados), e alerta de reposição (ritmo de consumo vs prazo de repor). Use quando perguntarem sobre estoque, insumo, o que falta comprar, o que está parado.
5. Analisar a produção (ferramenta analisar_producao) — quantos pedidos em produção/aguardando entrega/atrasados, tempo médio do início até a entrega, e onde está o gargalo (em qual etapa mais itens estão parados agora). Use quando perguntarem sobre produção, prazo, atraso, gargalo, produtividade da fábrica.
6. Analisar vendas do mês (ferramenta analisar_vendas) — faturamento do mês (comparado ao mês anterior), ticket médio, produtos mais vendidos. Use quando perguntarem sobre faturamento, quanto vendeu, o que mais vende.

Se o usuário perguntar sobre redes sociais/anúncios, avise que essa integração ainda não está conectada nessa empresa — não invente número de mídia paga ou alcance.

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
  {
    type: 'function',
    function: {
      name: 'analisar_estoque',
      description: 'Traz uma análise do estoque atual: valor total, itens abaixo do mínimo, itens parados (sem saída recente) e alertas de reposição (vão zerar antes do prazo de repor).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analisar_producao',
      description: 'Traz uma análise da produção atual: quantos pedidos em cada etapa, atrasados, tempo médio de produção e onde está o gargalo.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analisar_vendas',
      description: 'Traz uma análise de vendas do mês atual: faturamento (comparado ao mês anterior), ticket médio e produtos mais vendidos.',
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
      } else if (call.function.name === 'analisar_estoque') {
        const empresaId = perfilSolicitante.empresa_id;
        const desde30d = new Date(); desde30d.setDate(desde30d.getDate() - 30);
        const [{ data: servicosEmpresa }, { data: movimentosSaida }] = await Promise.all([
          supabaseAdmin.from('servicos').select('id, nome, estoque, estoque_minimo, preco, prazo_fabricacao_dias').eq('empresa_id', empresaId),
          supabaseAdmin.from('estoque_movimentacoes').select('servico_id, quantidade, created_at').eq('empresa_id', empresaId).lt('quantidade', 0).gte('created_at', desde30d.toISOString()),
        ]);
        const produtosComEstoque = (servicosEmpresa || []).filter((s: any) => s.estoque !== null && s.estoque !== undefined);
        const idsComSaidaRecente = new Set((movimentosSaida || []).map((m: any) => m.servico_id));
        const valorTotalEstoque = produtosComEstoque.reduce((s: number, p: any) => s + (p.preco || 0) * (p.estoque || 0), 0);
        const itensEstoqueBaixo = produtosComEstoque.filter((s: any) => s.estoque <= (s.estoque_minimo ?? 5)).map((s: any) => ({ nome: s.nome, estoque: s.estoque }));
        const itensParados = produtosComEstoque.filter((s: any) => s.estoque > 0 && !idsComSaidaRecente.has(s.id)).map((s: any) => s.nome);
        const alertasReposicao = calcularAlertasReposicao(produtosComEstoque, movimentosSaida || [])
          .map(a => ({ nome: a.nome, diasRestantes: Math.max(0, Math.floor(a.diasRestantes)) }));
        historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({
          totalItens: produtosComEstoque.length, valorTotalEstoque,
          itensEstoqueBaixo: itensEstoqueBaixo.slice(0, 15), itensParados: itensParados.slice(0, 15),
          alertasReposicao: alertasReposicao.slice(0, 10),
        }) });
      } else if (call.function.name === 'analisar_producao') {
        const empresaId = perfilSolicitante.empresa_id;
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
        const [{ data: empresaRow }, { data: producoesEmpresa }] = await Promise.all([
          supabaseAdmin.from('empresas').select('modulos').eq('id', empresaId).single(),
          supabaseAdmin.from('pulse_producoes').select('id, status, etapa_fabricacao_idx, previsao_entrega, created_at').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(400),
        ]);
        const idsEmpresa = new Set((producoesEmpresa || []).map((p: any) => p.id));
        const { data: eventosEntrega } = await supabaseAdmin.from('pulse_producao_eventos').select('producao_id, created_at').eq('tipo', 'status').ilike('texto', '%Entregue%').gte('created_at', inicioMes.toISOString());
        const entregasEmpresa = (eventosEntrega || []).filter((e: any) => idsEmpresa.has(e.producao_id));
        const producaoPorId = new Map((producoesEmpresa || []).map((p: any) => [p.id, p]));
        const emProducao = (producoesEmpresa || []).filter((p: any) => p.status === 'em_producao');
        const aguardandoEntrega = (producoesEmpresa || []).filter((p: any) => p.status === 'concluida');
        const atrasadas = (producoesEmpresa || []).filter((p: any) => p.previsao_entrega && new Date(p.previsao_entrega) < new Date() && p.status !== 'entregue');
        const prazos = entregasEmpresa.map((e: any) => {
          const p = producaoPorId.get(e.producao_id);
          if (!p) return null;
          const dias = (new Date(e.created_at).getTime() - new Date(p.created_at).getTime()) / 86400000;
          return dias >= 0 ? dias : null;
        }).filter((d: number | null): d is number => d !== null);
        const tempoMedioDias = prazos.length > 0 ? prazos.reduce((s: number, d: number) => s + d, 0) / prazos.length : null;
        const ETAPAS = etapasFabricacaoDe(empresaRow?.modulos);
        const gargalo = ETAPAS.map((nome: string, idx: number) => ({ etapa: nome, quantidade: emProducao.filter((p: any) => p.etapa_fabricacao_idx === idx).length }));
        historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({
          emProducao: emProducao.length, aguardandoEntrega: aguardandoEntrega.length, atrasadas: atrasadas.length,
          entreguesEsteMes: entregasEmpresa.length, tempoMedioDias: tempoMedioDias != null ? Math.round(tempoMedioDias) : null, gargalo,
        }) });
      } else if (call.function.name === 'analisar_vendas') {
        const empresaId = perfilSolicitante.empresa_id;
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
        const inicioMesAnterior = new Date(inicioMes); inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
        const [{ data: vendasMes }, { data: vendasMesAnterior }] = await Promise.all([
          supabaseAdmin.from('leads').select('valor_total, itens').eq('empresa_id', empresaId).eq('tipo', 'Pulse').eq('status', 'ganho').gte('created_at', inicioMes.toISOString()),
          supabaseAdmin.from('leads').select('valor_total').eq('empresa_id', empresaId).eq('tipo', 'Pulse').eq('status', 'ganho').gte('created_at', inicioMesAnterior.toISOString()).lt('created_at', inicioMes.toISOString()),
        ]);
        const faturamentoMes = (vendasMes || []).reduce((s: number, v: any) => s + (Number(v.valor_total) || 0), 0);
        const faturamentoMesAnterior = (vendasMesAnterior || []).reduce((s: number, v: any) => s + (Number(v.valor_total) || 0), 0);
        const ticketMedio = (vendasMes || []).length > 0 ? faturamentoMes / (vendasMes || []).length : 0;
        const acumProdutos: Record<string, { quantidade: number; valor: number }> = {};
        (vendasMes || []).forEach((v: any) => (v.itens || []).forEach((i: any) => {
          if (!acumProdutos[i.servico]) acumProdutos[i.servico] = { quantidade: 0, valor: 0 };
          acumProdutos[i.servico].quantidade += i.quantidade;
          acumProdutos[i.servico].valor += i.quantidade * i.precoUnitario;
        }));
        const topProdutos = Object.entries(acumProdutos).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor).slice(0, 8);
        historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({
          faturamentoMes, faturamentoMesAnterior, pedidosFechados: (vendasMes || []).length, ticketMedio, topProdutos,
        }) });
      } else {
        historico.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ erro: 'Ferramenta desconhecida.' }) });
      }
    }

    const segunda = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      max_tokens: 1000,
      temperature: 0.3,
      reasoning_effort: 'low',
      include_reasoning: false,
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
