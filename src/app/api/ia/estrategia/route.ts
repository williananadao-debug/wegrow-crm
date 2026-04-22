import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const SYSTEM_PROMPT = `Você é um especialista em vendas de mídia/rádio local.
Analise os candidatos fornecidos e selecione os mais promissores para contato comercial.

REGRAS:
- Retorne APENAS um array JSON válido
- Cada item deve ter: id, nome, motivo_ia (1 frase de justificativa em português), score_ia (0-100), abordagem (dica rápida de como abordar)
- Ordene do maior para o menor score
- Selecione apenas os melhores dentro do limite informado
- Seja específico: mencione valor histórico, tempo sem compra, oportunidade concreta

Responda SOMENTE com o array JSON, sem markdown, sem texto adicional.`;

export async function POST(req: NextRequest) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = await req.json();
    const { tipo, empresa_id, vendedor_id, limite, dias_inativo, produto_foco, criado_por } = body;

    if (!empresa_id || !tipo || !criado_por) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }

    const agora = new Date();
    const tipoLabel: Record<string, string> = {
      resgate: 'Resgate de Inativos',
      churn: 'Prevenção de Perda',
      mix: 'Primeira Compra',
    };

    let candidatos: any[] = [];

    if (tipo === 'resgate') {
      // Clientes com leads ganhos mas sem lead ativo/aberto hoje
      const { data: ganhos } = await supabaseAdmin
        .from('leads')
        .select('client_id, empresa, valor_total, created_at, unidade, cidade, user_id')
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

      // Agrupa por client_id, pega o mais recente de cada cliente
      const porCliente = new Map<string, any>();
      for (const lead of ganhos || []) {
        if (!clientesAtivos.has(lead.client_id) && !porCliente.has(lead.client_id)) {
          porCliente.set(lead.client_id, lead);
        }
      }

      candidatos = Array.from(porCliente.values()).slice(0, 80).map(l => ({
        id: l.client_id,
        nome: l.empresa,
        valor_historico: l.valor_total,
        dias_sem_compra: Math.floor((agora.getTime() - new Date(l.created_at).getTime()) / 86400000),
        cidade: l.cidade,
        unidade: l.unidade,
        user_id_original: l.user_id,
      }));

    } else if (tipo === 'churn') {
      // Clientes com contrato vencendo nos próximos 90 dias
      const em90dias = new Date(agora.getTime() + 90 * 86400000);
      const { data: vencendo } = await supabaseAdmin
        .from('leads')
        .select('id, client_id, empresa, valor_total, contrato_fim, unidade, cidade, user_id')
        .eq('empresa_id', empresa_id)
        .eq('status', 'ganho')
        .gte('contrato_fim', agora.toISOString().split('T')[0])
        .lte('contrato_fim', em90dias.toISOString().split('T')[0])
        .order('contrato_fim', { ascending: true })
        .limit(80);

      candidatos = (vencendo || []).map(l => ({
        id: l.id,
        client_id: l.client_id,
        nome: l.empresa,
        valor_historico: l.valor_total,
        dias_para_vencer: Math.floor((new Date(l.contrato_fim).getTime() - agora.getTime()) / 86400000),
        cidade: l.cidade,
        unidade: l.unidade,
        user_id_original: l.user_id,
      }));

    } else if (tipo === 'mix') {
      // Clientes cadastrados que nunca tiveram lead ganho
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
        .slice(0, 80)
        .map(c => ({
          id: c.id,
          nome: c.nome_empresa,
          cidade: c.cidade,
          score_interno: c.score_interno,
          limite_credito: c.limite_credito,
          status_risco: c.status_risco,
          user_id_original: c.user_id,
        }));
    }

    if (candidatos.length === 0) {
      return NextResponse.json({ count: 0, message: 'Nenhum candidato encontrado para este algoritmo.' });
    }

    const userPrompt = `ESTRATÉGIA: ${tipoLabel[tipo]}
PRODUTO FOCO: ${produto_foco || 'Geral'}
LIMITE DE SELEÇÃO: ${limite}
${tipo === 'resgate' ? `CRITÉRIO: clientes que compraram mas estão há mais de ${dias_inativo} dias sem retornar` : ''}
${tipo === 'churn' ? 'CRITÉRIO: contratos vencendo em breve — priorize maior valor e menor prazo' : ''}
${tipo === 'mix' ? 'CRITÉRIO: clientes cadastrados que nunca compraram — priorize score_interno alto e risco aprovado' : ''}

CANDIDATOS DISPONÍVEIS (${candidatos.length} encontrados):
${JSON.stringify(candidatos, null, 2)}

Selecione e priorize os ${limite} melhores para a estratégia ${tipoLabel[tipo]}.`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 4096,
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
      return NextResponse.json({ count: 0, message: 'IA não selecionou candidatos suficientes.' });
    }

    // Cria novos leads para os selecionados
    const novoLeads = selecionados.map((s: any) => {
      const candidato = candidatos.find(c => c.id === s.id);
      return {
        empresa: s.nome || candidato?.nome || 'Lead IA',
        status: 'aberto',
        etapa: 0,
        user_id: vendedor_id || candidato?.user_id_original || criado_por,
        origem: `IA — ${tipoLabel[tipo]}`,
        descricao: `🤖 IA Sugere (score ${s.score_ia}/100): ${s.motivo_ia || ''}${s.abordagem ? ` | Abordagem: ${s.abordagem}` : ''}`,
        empresa_id,
        ...(tipo !== 'mix' ? { client_id: tipo === 'resgate' ? s.id : candidato?.client_id } : { client_id: s.id }),
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
