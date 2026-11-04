import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

// Transcrição dos campos de texto livre (visitas, notas do lead, observações) com o Whisper
// da Groq. O áudio só passa por aqui: não é gravado em lugar nenhum, só o texto volta.
export const maxDuration = 60;

const TAMANHO_MAXIMO = 15 * 1024 * 1024; // ~10 min de áudio comprimido; a Groq aceita até 25 MB

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  const { data: perfil } = await supabaseAdmin.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('audio');
    if (f instanceof File) audio = f;
  } catch {
    return NextResponse.json({ error: 'Áudio inválido.' }, { status: 400 });
  }
  if (!audio || audio.size === 0) return NextResponse.json({ error: 'Nenhum áudio recebido.' }, { status: 400 });
  if (audio.size > TAMANHO_MAXIMO) return NextResponse.json({ error: 'Áudio muito longo — grave em partes de até uns 5 minutos.' }, { status: 413 });

  // Vocabulário da empresa (nome e emissoras/unidades) ajuda o Whisper a acertar nomes próprios
  const [{ data: empresa }, { data: unidades }] = await Promise.all([
    supabaseAdmin.from('empresas').select('nome').eq('id', perfil.empresa_id).maybeSingle(),
    supabaseAdmin.from('unidades').select('nome').eq('empresa_id', perfil.empresa_id).limit(20),
  ]);
  const vocabulario = [empresa?.nome, ...(unidades || []).map(u => u.nome)].filter(Boolean).join(', ');

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const r = await groq.audio.transcriptions.create({
      file: audio,
      model: 'whisper-large-v3-turbo',
      language: 'pt',
      response_format: 'json',
      temperature: 0,
      prompt: `Anotação de vendedor sobre visita a cliente, proposta comercial ou negociação.${vocabulario ? ` Nomes: ${vocabulario}.` : ''}`,
    });
    const texto = String(r.text || '').trim();
    console.log(`[transcrever] empresa=${perfil.empresa_id} bytes=${audio.size} chars=${texto.length}`);
    return NextResponse.json({ texto });
  } catch (err: any) {
    console.error('[transcrever] erro', err?.status, err?.message);
    return NextResponse.json({ error: 'Não foi possível transcrever agora. Tente de novo.' }, { status: 502 });
  }
}
