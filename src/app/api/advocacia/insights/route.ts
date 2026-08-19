import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Camada de IA do módulo Advocacia — narração em português dos números do mês, no mesmo
// espírito do agente do Argus (src/app/api/argus/agente/chat/route.ts): o servidor calcula
// TUDO antes de chamar o Groq, o modelo só narra os números prontos, nunca inventa ou refaz
// conta. Aqui é chamada única (não é chat com tool-calling) — só a narração pro card do
// Painel/Inteligência.

const SYSTEM_PROMPT = `Você narra, em português, um resumo mensal de indicadores de um escritório de advocacia dentro do sistema WeGrow.

Regras importantes:
- Você recebe um JSON com os números já calculados pelo servidor. Nunca invente números, nunca recalcule nada — só use exatamente os valores que vieram no JSON.
- Seja direto e objetivo, 3 a 5 frases corridas (sem listas, sem markdown).
- Destaque o que mais chama atenção: o canal com melhor/pior conversão, leads sem follow-up há muito tempo, inadimplência se houver.
- Se algum número for zero ou não houver dado suficiente, diga isso com naturalidade em vez de ignorar.
- Tom profissional, sem exagero nem emoji.`;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function autenticar(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id) return null;
  return { user, empresa_id: perfil.empresa_id, db };
}

export async function GET(request: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ erro: 'GROQ_API_KEY não configurada.' }, { status: 503 });
  }
  const auth = await autenticar(request);
  if (!auth) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  const { empresa_id, db } = auth;

  const hoje = new Date();
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const mesReferencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const [{ data: leads }, { data: lancamentos }] = await Promise.all([
    db.from('leads').select('etapa, origem, followup_em, created_at, status').eq('empresa_id', empresa_id),
    db.from('lancamentos').select('valor, status, data_vencimento, data_pagamento').eq('empresa_id', empresa_id).not('processo_id', 'is', null),
  ]);

  const leadsMes = (leads || []).filter(l => l.created_at >= inicioMes);
  const convertidosMes = leadsMes.filter(l => l.etapa === 4);

  const porCanal = new Map<string, { total: number; convertidos: number }>();
  leadsMes.forEach(l => {
    const canal = (l.origem || 'Não informado').trim() || 'Não informado';
    const atual = porCanal.get(canal) || { total: 0, convertidos: 0 };
    atual.total++;
    if (l.etapa === 4) atual.convertidos++;
    porCanal.set(canal, atual);
  });
  const canaisResumo = [...porCanal.entries()].map(([canal, d]) => ({
    canal, leads: d.total, convertidos: d.convertidos,
    taxa_conversao_pct: d.total > 0 ? Number(((d.convertidos / d.total) * 100).toFixed(1)) : 0,
  }));

  const leadsEsfriando = (leads || []).filter(l => {
    if (l.etapa === 4 || l.etapa === 5) return false;
    if (!l.followup_em) return false;
    const dias = Math.floor((Date.now() - new Date(l.followup_em).getTime()) / (1000 * 60 * 60 * 24));
    return dias >= 5;
  }).length;

  const hojeStr = hoje.toISOString().slice(0, 10);
  const honorarios = (lancamentos || []);
  const faturamentoMes = honorarios.filter(l => l.status === 'pago' && (l.data_pagamento || '').slice(0, 7) === mesReferencia).reduce((s, l) => s + Number(l.valor || 0), 0);
  const vencidos = honorarios.filter(l => l.status === 'pendente' && l.data_vencimento < hojeStr);
  const totalInadimplente = vencidos.reduce((s, l) => s + Number(l.valor || 0), 0);

  const resumo = {
    mes_referencia: mesReferencia,
    novos_leads_no_mes: leadsMes.length,
    convertidos_no_mes: convertidosMes.length,
    canais: canaisResumo,
    leads_sem_followup_5_dias_ou_mais: leadsEsfriando,
    faturamento_recebido_no_mes: faturamentoMes,
    contas_vencidas_pendentes: { quantidade: vencidos.length, valor_total: totalInadimplente },
  };

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Números do mês:\n${JSON.stringify(resumo, null, 2)}` },
      ],
      temperature: 0.4,
    });
    const narrativa = completion.choices[0]?.message?.content?.trim() || 'Não consegui gerar o resumo agora.';
    return NextResponse.json({ narrativa, resumo });
  } catch (err: any) {
    return NextResponse.json({ erro: 'Erro ao gerar insights: ' + (err?.message || 'desconhecido') }, { status: 502 });
  }
}
