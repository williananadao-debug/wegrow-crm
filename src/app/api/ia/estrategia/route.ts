import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SYSTEM_PROMPT = `Você é um motor de análise de CRM especializado em rádio/mídia local.
Analise os dados de leads fornecidos e selecione os melhores candidatos para a estratégia solicitada.

REGRAS:
- Retorne APENAS um array JSON válido com os leads selecionados
- Para cada lead, adicione um campo "motivo_ia" com uma justificativa de 1 frase em português
- Para cada lead, adicione um campo "score_ia" de 0 a 100 indicando prioridade
- Ordene do maior para o menor score
- Selecione apenas os mais promissores dentro do limite solicitado
- Foque nos leads com maior potencial de conversão para o tipo de estratégia

FORMATOS DE ESTRATÉGIA:
- resgate: Clientes inativos que já compraram antes — priorize ticket histórico alto e data mais recente de compra
- churn: Clientes em risco de sair — priorize leads com status "negociação" parados há muito tempo
- mix: Leads frios sem nenhuma compra — priorize aqueles com maior número de interações e empresas conhecidas

Responda SOMENTE com o array JSON, sem markdown, sem explicações adicionais.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tipo, empresa_id, vendedor_id, limite, dias_inativo, produto_foco, criado_por } = body;

    if (!empresa_id || !tipo || !criado_por) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }

    const agora = new Date();
    const diasAtras = new Date(agora.getTime() - dias_inativo * 24 * 60 * 60 * 1000);

    let query = supabaseAdmin
      .from('leads')
      .select('id, empresa, status, etapa, valor_total, origem, descricao, user_id, created_at, updated_at')
      .eq('empresa_id', empresa_id)
      .neq('status', 'ganho')
      .neq('status', 'cancelado')
      .limit(200);

    if (vendedor_id) query = query.eq('user_id', vendedor_id);

    if (tipo === 'resgate') {
      query = query.lte('updated_at', diasAtras.toISOString());
    } else if (tipo === 'churn') {
      query = query.in('status', ['negociacao', 'aberto']).lte('updated_at', diasAtras.toISOString());
    } else if (tipo === 'mix') {
      query = query.eq('etapa', 0).eq('status', 'aberto');
    }

    const { data: leads, error: leadsError } = await query;
    if (leadsError) throw new Error('Erro ao buscar leads: ' + leadsError.message);
    if (!leads || leads.length === 0) {
      return NextResponse.json({ count: 0, message: 'Nenhum lead encontrado para os critérios.' });
    }

    const leadsResumidos = leads.slice(0, 100).map(l => ({
      id: l.id,
      empresa: l.empresa,
      status: l.status,
      etapa: l.etapa,
      valor_historico: l.valor_total,
      dias_sem_update: Math.floor((agora.getTime() - new Date(l.updated_at || l.created_at).getTime()) / 86400000),
      user_id: l.user_id,
    }));

    const userPrompt = `ESTRATÉGIA: ${tipo.toUpperCase()}
PRODUTO FOCO: ${produto_foco || 'Geral'}
LIMITE DE SELEÇÃO: ${limite}
${tipo === 'resgate' ? `CRITÉRIO: inativos há mais de ${dias_inativo} dias` : ''}

LEADS DISPONÍVEIS:
${JSON.stringify(leadsResumidos, null, 2)}

Selecione e priorize os ${limite} melhores leads para a estratégia ${tipo}.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

    let leadsIA: any[] = [];
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      leadsIA = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return NextResponse.json({ error: 'Erro ao interpretar resposta da IA.', raw: rawText }, { status: 500 });
    }

    if (leadsIA.length === 0) {
      return NextResponse.json({ count: 0, message: 'IA não selecionou leads suficientes.' });
    }

    const tipoLabel: Record<string, string> = {
      resgate: 'Resgate de Inativos',
      churn: 'Prevenção de Perda',
      mix: 'Primeira Compra',
    };

    const { error: premissaError } = await supabaseAdmin.from('premissas').insert([{
      titulo: `IA Real — ${tipoLabel[tipo] || tipo}`,
      quantidade: leadsIA.length,
      regiao: produto_foco || 'Geral',
      tipo_cliente: 'Recuperação',
      user_id: vendedor_id || criado_por,
      criado_por,
      empresa_id,
    }]);
    if (premissaError) console.error('Aviso: erro ao salvar premissa:', premissaError.message);

    const leadsParaAtualizar = leadsIA.map((l: any) => ({
      id: l.id,
      descricao: `🤖 IA Sugere: ${l.motivo_ia || ''}`,
      origem: `IA — ${tipoLabel[tipo] || tipo}`,
      ...(vendedor_id ? { user_id: vendedor_id } : {}),
    }));

    for (const lead of leadsParaAtualizar) {
      await supabaseAdmin.from('leads').update({
        descricao: lead.descricao,
        origem: lead.origem,
        ...(lead.user_id ? { user_id: lead.user_id } : {}),
      }).eq('id', lead.id);
    }

    return NextResponse.json({
      count: leadsIA.length,
      leads: leadsIA,
      tokens_usados: response.usage,
    });
  } catch (err: any) {
    console.error('[IA Estratégia] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
