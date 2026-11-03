import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { supabaseAdmin } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// "Analisar com IA" dos relatórios gerenciais: o navegador manda a tabela já calculada (até 40
// linhas, com a variação contra o período anterior) e os achados automáticos; o modelo só lê e
// devolve diagnóstico + plano de ação. Nunca recalcula nem inventa número.
const SYSTEM_PROMPT = `Você é um consultor comercial que analisa relatórios de vendas dentro do CRM WeGrow (usado por rádios, TVs e empresas locais no Brasil).

Regras:
- Use SOMENTE os números recebidos. Não invente valores, não recalcule totais.
- Compare com o período anterior quando houver a coluna "vs anterior" ou a métrica com variação.
- Seja específico: cite nomes de vendedores, segmentos, produtos ou clientes que aparecem na tabela.
- Cada ação deve ser prática, com quem faz e em quanto tempo (ex.: "nesta semana", "até o fim do mês").
- Português do Brasil, frases curtas, sem markdown e sem emoji.

Responda APENAS um JSON válido neste formato:
{"resumo": "2 a 3 frases com a leitura geral do período", "itens": [{"titulo": "achado curto", "analise": "o que os números mostram e por quê importa", "acao": "o que fazer, quem e quando", "prioridade": "alta" | "media" | "baixa"}]}
Traga de 3 a 5 itens, os mais importantes primeiro.`;

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('cargo').eq('id', user.id).single();
  if (!['diretor', 'gerente'].includes(perfil?.cargo)) return NextResponse.json({ erro: 'Só diretoria e gerência.' }, { status: 403 });

  let corpo: any;
  try { corpo = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const dados = {
    relatorio: String(corpo?.relatorio || '').slice(0, 120),
    descricao: String(corpo?.descricao || '').slice(0, 400),
    periodo: corpo?.periodo, periodo_anterior: corpo?.periodo_anterior,
    resumo: corpo?.resumo || null, metrica: corpo?.metrica || null,
    colunas: Array.isArray(corpo?.colunas) ? corpo.colunas.slice(0, 12) : [],
    linhas: Array.isArray(corpo?.linhas) ? corpo.linhas.slice(0, 40) : [],
    achados_automaticos: Array.isArray(corpo?.achados) ? corpo.achados.slice(0, 8) : [],
  };
  if (!dados.linhas.length) return NextResponse.json({ erro: 'Relatório sem dados no período.' }, { status: 422 });

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Relatório:\n${JSON.stringify(dados)}` },
      ],
      temperature: 0.3,
      reasoning_effort: 'low',
      include_reasoning: false,
      response_format: { type: 'json_object' },
    } as any);
    const bruto = completion.choices[0]?.message?.content?.trim() || '{}';
    let j: any;
    try { j = JSON.parse(bruto); } catch { j = { resumo: bruto, itens: [] }; }
    const itens = (Array.isArray(j.itens) ? j.itens : []).slice(0, 6).map((x: any) => ({
      titulo: String(x.titulo || ''), analise: String(x.analise || ''), acao: String(x.acao || ''),
      prioridade: ['alta', 'media', 'baixa'].includes(x.prioridade) ? x.prioridade : 'media',
    }));
    return NextResponse.json({ resumo: String(j.resumo || ''), itens });
  } catch (err: any) {
    console.error('[relatorios/insights]', err);
    return NextResponse.json({ erro: 'Não consegui gerar a análise agora. Tente de novo em instantes.' }, { status: 502 });
  }
}
