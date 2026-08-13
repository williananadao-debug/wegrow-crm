import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MAX_INSTRUCOES, MAX_ADENDO_ITENS } from '@/lib/max-instrucoes';

// Padrão de chamada ao Gemini definido pelo Leo (IAlto) no handoff técnico do Max —
// decisões tiradas da prática, não são zelo excessivo:
// - modelo primário é preview e cai de verdade, por isso o fallback é obrigatório
// - instruções vão como 1º turno "user" + ack "model" fabricado, nunca systemInstruction
// - contexto de data precisa ser injetado em toda requisição (senão erra prazo/sazonalidade)
const MODELO_PRIMARIO = 'gemini-3-flash-preview';
const MODELO_FALLBACK = 'gemini-2.5-flash';

const ACK_INSTRUCOES = 'Entendido. Vou seguir à risca as instruções e o catálogo 2026 da Demais FM — só ofereço o que está literalmente no catálogo, sempre faço o diagnóstico antes de recomendar produto, e só emito o JSON final depois da confirmação explícita do vendedor.';

function contextoData() {
  const hoje = new Date();
  return `Contexto automático: hoje é ${hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}. Use essa data pra avaliar prazos, sazonalidade e urgência do que o vendedor pedir.`;
}

// As instruções do Leo dizem "você já sabe qual vendedor está logado", mas isso só é
// verdade se essa info for injetada aqui — sem isso o Max fica perguntando "quem está
// falando" a cada conversa, mesmo o backend já sabendo (perfilSolicitante vem do token).
function contextoVendedorLogado(nome: string, cargo: string | null) {
  return `Vendedor logado nesta conversa: ${nome}${cargo ? ` (${cargo})` : ''}. Você já sabe quem é — nunca pergunte "quem está falando" ou peça pro vendedor se identificar. Use esse nome automaticamente no campo "nome" do vendedor ao emitir o JSON final. Pra "cargo" e "whatsapp", localize esse mesmo nome na tabela EQUIPE COMERCIAL das instruções e use o telefone de lá; se o nome não constar exatamente na tabela, use "${cargo || 'vendedor'}" como cargo e deixe o whatsapp em branco.`;
}

async function chamarGemini(model: string, contents: any[]): Promise<any> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 16384 },
    }),
  });
  return res;
}

async function gerarComRetry(contents: any[]): Promise<string> {
  let res = await chamarGemini(MODELO_PRIMARIO, contents);

  if (res.status === 429) {
    const retryAfterHeader = res.headers.get('retry-after');
    let esperaMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2000;
    try {
      const corpo = await res.clone().json();
      const retryInfo = corpo?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'));
      const delaySeg = retryInfo?.retryDelay ? parseFloat(retryInfo.retryDelay) : null;
      if (delaySeg) esperaMs = delaySeg * 1000;
    } catch {}
    esperaMs = Math.min(esperaMs, 8000);
    await new Promise(r => setTimeout(r, esperaMs));
    res = await chamarGemini(MODELO_PRIMARIO, contents);
  }

  if (!res.ok && res.status >= 500) {
    res = await chamarGemini(MODELO_FALLBACK, contents);
  }
  if (!res.ok && res.status === 429) {
    res = await chamarGemini(MODELO_FALLBACK, contents);
  }

  if (!res.ok) {
    const erro = await res.text();
    throw new Error(`Gemini respondeu ${res.status}: ${erro.slice(0, 300)}`);
  }

  const json = await res.json();
  const texto = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  if (!texto) throw new Error('Gemini não retornou texto.');
  return texto;
}

type ItemProposta = { produto: string; especificacao?: string; emissora?: string; quantidade: number; valor_unitario: number };
type Proposta = { titulo: string; corpo: string; itens?: ItemProposta[]; valor_total?: number };

function extrairPropostas(textoCompleto: string): { textoLimpo: string; propostas: Proposta[] | null; empresa: string | null } {
  const match = textoCompleto.match(/```json\s*([\s\S]*?)```/);
  if (!match) return { textoLimpo: textoCompleto, propostas: null, empresa: null };

  let dados: any;
  try {
    dados = JSON.parse(match[1].trim());
  } catch {
    return { textoLimpo: textoCompleto, propostas: null, empresa: null };
  }

  if (dados?.action !== 'gerar_proposta_pptx' || !Array.isArray(dados?.propostas)) {
    return { textoLimpo: textoCompleto, propostas: null, empresa: null };
  }

  const propostas: Proposta[] = dados.propostas.map((p: any) => {
    const itens: ItemProposta[] = Array.isArray(p.itens)
      ? p.itens.map((i: any) => ({
          produto: String(i.produto || ''),
          especificacao: i.especificacao ? String(i.especificacao) : undefined,
          emissora: i.emissora ? String(i.emissora) : undefined,
          quantidade: Number(i.quantidade) || 1,
          valor_unitario: Number(i.valor_unitario) || 0,
        }))
      : [];
    // Nunca confia na soma que o modelo fez — recalcula sempre a partir dos itens.
    const valor_total = itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0);
    return { titulo: String(p.titulo || ''), corpo: String(p.corpo || ''), itens, valor_total };
  });

  const textoLimpo = textoCompleto.replace(match[0], '').trim();
  return { textoLimpo, propostas, empresa: dados.empresa ? String(dados.empresa) : null };
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada.' }, { status: 503 });
  }

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
    .select('empresa_id, nome, cargo')
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

    const historico = mensagens.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }],
    }));

    const contents = [
      { role: 'user', parts: [{ text: `${MAX_INSTRUCOES}\n\n---\n\n${MAX_ADENDO_ITENS}` }] },
      { role: 'model', parts: [{ text: ACK_INSTRUCOES }] },
      { role: 'user', parts: [{ text: contextoData() }] },
      { role: 'model', parts: [{ text: 'Ok, considerando essa data.' }] },
      { role: 'user', parts: [{ text: contextoVendedorLogado(perfilSolicitante.nome, perfilSolicitante.cargo) }] },
      { role: 'model', parts: [{ text: `Entendido, ${perfilSolicitante.nome} está logado(a). Vou usar esses dados automaticamente no JSON final, sem perguntar quem está falando.` }] },
      ...historico,
    ];

    const textoCompleto = await gerarComRetry(contents);
    const { textoLimpo, propostas, empresa } = extrairPropostas(textoCompleto);

    return NextResponse.json({
      resposta: textoLimpo || 'Arquivo sendo gerado — em instantes estará disponível para download. ✅',
      propostas,
      empresa,
      vendedor: { nome: perfilSolicitante.nome, cargo: perfilSolicitante.cargo },
    });

  } catch (err: any) {
    console.error('[Max Chat] Erro:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
