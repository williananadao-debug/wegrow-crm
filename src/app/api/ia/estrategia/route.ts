import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const SYSTEM_PROMPT = `Você é um especialista em vendas de mídia/rádio local com profundo conhecimento em publicidade regional.
Analise os candidatos e sugira um pacote de produtos específico para cada um.

REGRAS:
- Retorne APENAS um array JSON válido
- Cada item deve ter:
  - id: o mesmo id do candidato
  - nome: nome da empresa
  - score_ia: 0 a 100 (prioridade)
  - motivo_ia: 1 frase explicando por que esse cliente tem potencial agora
  - abordagem: como o vendedor deve abordar (1 frase direta)
  - itens_sugeridos: array com os produtos recomendados, cada um com:
    - servico: nome exato do produto (use os nomes da lista de serviços disponíveis)
    - quantidade: número inteiro
    - precoUnitario: preço do produto (use o preço da lista)
    - tempo: duração se aplicável (ex: "30\"", "60\"") ou omita
    - programa: programa de veiculação se aplicável ou omita
- Ordene do maior para o menor score
- Selecione apenas os melhores dentro do limite informado
- Para resgate: sugira os mesmos produtos que o cliente comprou antes, com upgrade se possível
- Para churn: sugira renovação do pacote atual com algum benefício adicional
- Para mix: sugira o pacote de entrada mais adequado ao perfil do cliente

Responda SOMENTE com o array JSON, sem markdown, sem texto adicional.`;

export async function POST(req: NextRequest) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Validate JWT and get empresa_id from profile (never trust the request body)
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
    .select('cargo, empresa_id')
    .eq('id', solicitante.id)
    .single();
  if (!perfilSolicitante?.empresa_id) {
    return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });
  }
  const empresaIdSeguro = perfilSolicitante.empresa_id;

  try {
    const body = await req.json();
    const { tipo, vendedor_id, limite, dias_inativo, produto_foco, criado_por } = body;

    if (!tipo || !criado_por) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }
    const empresa_id = empresaIdSeguro;

    const agora = new Date();
    const tipoLabel: Record<string, string> = {
      resgate: 'Resgate de Inativos',
      churn: 'Prevenção de Perda',
      mix: 'Primeira Compra',
    };

    // Busca catálogo de serviços disponíveis (máx 15 para não estourar tokens)
    const { data: servicos } = await supabaseAdmin
      .from('servicos')
      .select('nome, preco, tipo')
      .eq('empresa_id', empresa_id)
      .order('preco', { ascending: true })
      .limit(15);

    const catalogoServicos = (servicos || []).map(s => `${s.nome}|R$${s.preco}`).join('; ');

    let candidatos: any[] = [];

    if (tipo === 'resgate') {
      const { data: ganhos } = await supabaseAdmin
        .from('leads')
        .select('client_id, empresa, valor_total, itens, created_at, unidade, cidade, user_id')
        .eq('empresa_id', empresa_id)
        .eq('status', 'ganho')
        .not('client_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(300);

      const { data: ativos } = await supabaseAdmin
        .from('leads')
        .select('client_id')
        .eq('empresa_id', empresa_id)
        .in('status', ['aberto', 'negociacao'])
        .not('client_id', 'is', null);

      const clientesAtivos = new Set((ativos || []).map((l: any) => l.client_id));

      const porCliente = new Map<string, any>();
      for (const lead of ganhos || []) {
        if (!clientesAtivos.has(lead.client_id) && !porCliente.has(lead.client_id)) {
          porCliente.set(lead.client_id, lead);
        }
      }

      candidatos = Array.from(porCliente.values()).slice(0, 20).map(l => ({
        id: l.client_id,
        nome: l.empresa,
        val: l.valor_total,
        dias: Math.floor((agora.getTime() - new Date(l.created_at).getTime()) / 86400000),
        hist: Array.isArray(l.itens) ? l.itens.slice(0, 2).map((i: any) => `${i.quantidade}x ${i.servico}`).join(',') : '',
        cidade: l.cidade,
        user_id_original: l.user_id,
      }));

    } else if (tipo === 'churn') {
      const em90dias = new Date(agora.getTime() + 90 * 86400000);
      const { data: vencendo } = await supabaseAdmin
        .from('leads')
        .select('id, client_id, empresa, valor_total, itens, contrato_fim, unidade, cidade, user_id')
        .eq('empresa_id', empresa_id)
        .eq('status', 'ganho')
        .gte('contrato_fim', agora.toISOString().split('T')[0])
        .lte('contrato_fim', em90dias.toISOString().split('T')[0])
        .order('contrato_fim', { ascending: true })
        .limit(60);

      candidatos = (vencendo || []).slice(0, 20).map(l => ({
        id: l.id,
        client_id: l.client_id,
        nome: l.empresa,
        val: l.valor_total,
        vence_em: Math.floor((new Date(l.contrato_fim).getTime() - agora.getTime()) / 86400000),
        atual: Array.isArray(l.itens) ? l.itens.slice(0, 2).map((i: any) => `${i.quantidade}x ${i.servico}`).join(',') : '',
        cidade: l.cidade,
        user_id_original: l.user_id,
      }));

    } else if (tipo === 'mix') {
      const { data: clientes } = await supabaseAdmin
        .from('clientes')
        .select('id, nome_empresa, cidade, status_risco, score_interno, limite_credito, user_id')
        .eq('empresa_id', empresa_id)
        .eq('status', 'ativo')
        .limit(200);

      const { data: compraramAlgumaDia } = await supabaseAdmin
        .from('leads')
        .select('client_id')
        .eq('empresa_id', empresa_id)
        .eq('status', 'ganho')
        .not('client_id', 'is', null);

      const jaCompraram = new Set((compraramAlgumaDia || []).map((l: any) => l.client_id));

      candidatos = (clientes || [])
        .filter(c => !jaCompraram.has(c.id))
        .slice(0, 20)
        .map(c => ({
          id: c.id,
          nome: c.nome_empresa,
          cidade: c.cidade,
          score: c.score_interno,
          limite: c.limite_credito,
          risco: c.status_risco,
          user_id_original: c.user_id,
        }));
    }

    if (candidatos.length === 0) {
      return NextResponse.json({ count: 0, message: 'Nenhum candidato encontrado para este algoritmo.' });
    }

    const userPrompt = `ESTRATÉGIA: ${tipoLabel[tipo]}
PRODUTO FOCO PREFERENCIAL: ${produto_foco || 'Qualquer'}
LIMITE DE SELEÇÃO: ${limite}

CATÁLOGO DE SERVIÇOS DISPONÍVEIS:
${catalogoServicos || 'Sem catálogo cadastrado — use nomes genéricos como "Spot 30s", "Patrocínio de Programa"'}

CANDIDATOS (${candidatos.length} encontrados):
${JSON.stringify(candidatos, null, 2)}

Selecione os ${limite} melhores candidatos e para cada um monte um pacote de produtos do catálogo acima.`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 3000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '';

    let selecionados: any[] = [];
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      selecionados = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return NextResponse.json({ error: 'Erro ao interpretar resposta da IA.', raw: rawText }, { status: 500 });
    }

    if (selecionados.length === 0) {
      return NextResponse.json({ count: 0, message: 'IA não selecionou candidatos.' });
    }

    const novoLeads = selecionados.map((s: any) => {
      const candidato = candidatos.find(c => c.id === s.id);
      const itens = Array.isArray(s.itens_sugeridos) ? s.itens_sugeridos : [];
      const valorTotal = itens.reduce((acc: number, i: any) => acc + ((i.precoUnitario || 0) * (i.quantidade || 1)), 0);

      return {
        empresa: s.nome || candidato?.nome || 'Lead IA',
        status: 'aberto',
        etapa: 0,
        user_id: vendedor_id || candidato?.user_id_original || criado_por,
        origem: `IA — ${tipoLabel[tipo]}`,
        descricao: `🤖 IA (score ${s.score_ia}/100): ${s.motivo_ia || ''} | Abordagem: ${s.abordagem || ''}`,
        itens: itens,
        valor_total: valorTotal || null,
        empresa_id,
        client_id: tipo === 'churn' ? (candidato?.client_id || null) : s.id,
        unidade: candidato?.unidade || null,
        cidade: candidato?.cidade || null,
      };
    });

    const { error: leadsError } = await supabaseAdmin.from('leads').insert(novoLeads);
    if (leadsError) throw new Error('Erro ao criar leads: ' + leadsError.message);

    await supabaseAdmin.from('premissas').insert([{
      titulo: `IA — ${tipoLabel[tipo]}`,
      quantidade: novoLeads.length,
      regiao: produto_foco || 'Geral',
      tipo_cliente: 'Recuperação',
      user_id: vendedor_id || criado_por,
      criado_por,
      empresa_id,
    }]);

    return NextResponse.json({ count: novoLeads.length, leads: selecionados });

  } catch (err: any) {
    console.error('[IA Estratégia] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
