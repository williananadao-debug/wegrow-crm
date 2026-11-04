import type Groq from 'groq-sdk';

// Reserva da IA: a Groq (plano gratuito) tem limite diário por modelo. Quando ela responde
// "limite atingido" (429) ou fica fora do ar, o mesmo pedido vai para o Google Gemini, sem o
// usuário perceber. Cobre chat sem ferramentas (relatórios, insights, leitura de nota) e
// transcrição de áudio. Thor/Argus usam tools e não passam por aqui.
// Em ordem: se um estiver sobrecarregado (503), sem cota (429) ou aposentado (404), tenta o próximo.
// O Google aposenta modelos com frequência (o 2.5-flash já não aceita contas novas).
const MODELOS_GEMINI = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

function deveUsarReserva(err: any) {
  const s = Number(err?.status);
  return !!process.env.GEMINI_API_KEY && (s === 429 || s === 498 || s >= 500 || !s);
}

async function gemini(body: { generationConfig?: Record<string, unknown>; [k: string]: unknown }): Promise<string> {
  let ultimoErro: any = null;
  for (const modelo of MODELOS_GEMINI) {
    // Raciocínio no mínimo que o modelo aceitar: a resposta usa o limite de tokens inteiro
    for (const thinking of [{ thinkingConfig: { thinkingLevel: 'low' } }, {}]) {
      // 25s por tentativa contando a leitura da resposta inteira, não só o cabeçalho
      const ctrl = new AbortController();
      const limite = setTimeout(() => ctrl.abort(), 25_000);
      let res: Response, json: any;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
          body: JSON.stringify({ ...body, generationConfig: { ...body.generationConfig, ...thinking } }),
        });
        json = await res.json().catch(() => ({}));
      } catch {
        ultimoErro = Object.assign(new Error(`Gemini ${modelo} sem resposta em 25s`), { status: 504 });
        break;
      } finally {
        clearTimeout(limite);
      }
      if (ctrl.signal.aborted) { ultimoErro = Object.assign(new Error(`Gemini ${modelo} sem resposta em 25s`), { status: 504 }); break; }
      if (res.ok) return String(json?.candidates?.[0]?.content?.parts?.map((p: any) => (p.thought ? '' : p.text || '')).join('') || '');
      ultimoErro = Object.assign(new Error(`Gemini ${modelo} ${res.status}: ${json?.error?.message || 'erro'}`), { status: res.status });
      if (res.status === 400 && /thinking/i.test(json?.error?.message || '')) continue;
      break;
    }
    if (![404, 429, 500, 503, 504].includes(ultimoErro?.status)) throw ultimoErro;
    console.warn(`[iaReserva] ${ultimoErro.message} — tentando o próximo modelo`);
  }
  throw ultimoErro;
}

function partes(content: any): any[] {
  if (typeof content === 'string') return [{ text: content }];
  return (Array.isArray(content) ? content : []).map((c: any) => {
    if (c?.type === 'image_url') {
      const m = String(c.image_url?.url || '').match(/^data:([^;]+);base64,(.+)$/);
      return m ? { inline_data: { mime_type: m[1], data: m[2] } } : { text: '' };
    }
    return { text: String(c?.text ?? '') };
  });
}

// Mesmo formato de entrada e saída de groq.chat.completions.create (sem stream e sem tools):
// as rotas só trocam a chamada e continuam lendo choices[0].message.content.
export async function chatComReserva(groq: Groq, params: any): Promise<any> {
  try {
    return await groq.chat.completions.create(params);
  } catch (err: any) {
    if (!deveUsarReserva(err)) throw err;
    console.warn(`[iaReserva] Groq ${err?.status || 'falhou'} em ${params?.model} — usando Gemini`);
    const msgs: any[] = params.messages || [];
    const sistema = msgs.filter(m => m.role === 'system').map(m => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
    const texto = await gemini({
      ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
      contents: msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: partes(m.content) })),
      generationConfig: {
        temperature: params.temperature ?? 0.4,
        ...(params.max_tokens ? { maxOutputTokens: Math.max(params.max_tokens, 1024) } : {}),
        ...(params.response_format?.type === 'json_object' ? { responseMimeType: 'application/json' } : {}),
      },
    });
    return { id: 'gemini', model: 'gemini', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: texto } }] };
  }
}

export async function transcreverComReserva(groq: Groq, audio: File, prompt: string): Promise<string> {
  try {
    const r = await groq.audio.transcriptions.create({
      file: audio, model: 'whisper-large-v3-turbo', language: 'pt', response_format: 'json', temperature: 0, prompt,
    });
    return String(r.text || '').trim();
  } catch (err: any) {
    if (!deveUsarReserva(err)) throw err;
    console.warn(`[iaReserva] Groq ${err?.status || 'falhou'} na transcrição — usando Gemini`);
    const data = Buffer.from(await audio.arrayBuffer()).toString('base64');
    const texto = await gemini({
      contents: [{ role: 'user', parts: [
        { text: `Transcreva fielmente este áudio em português do Brasil, com pontuação. Responda só com o texto falado, sem comentários. Contexto: ${prompt}` },
        { inline_data: { mime_type: (audio.type || 'audio/webm').split(';')[0], data } },
      ] }],
      generationConfig: { temperature: 0 },
    });
    return texto.trim();
  }
}
