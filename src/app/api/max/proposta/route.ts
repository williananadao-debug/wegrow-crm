import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarPropostaPptxBuffer, type PropostaPptx } from '@/lib/max-proposta-pptx';

export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: { user }, error: authError } = await db.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });

  const { data: perfil } = await db.from('profiles').select('empresa_id, nome').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });

  const { data: empresaRow } = await db.from('empresas').select('modulos').eq('id', perfil.empresa_id).single();
  if (!empresaRow?.modulos?.max) return NextResponse.json({ erro: 'Módulo Max não está ativo pra sua empresa.' }, { status: 403 });

  try {
    const body = await req.json();
    const empresaNome: string = String(body?.empresa || 'Cliente');
    const propostasBrutas = Array.isArray(body?.propostas) ? body.propostas : [];
    if (propostasBrutas.length === 0) {
      return NextResponse.json({ erro: 'Nenhuma proposta enviada.' }, { status: 400 });
    }
    const propostas: PropostaPptx[] = propostasBrutas.map((p: any) => ({
      titulo: String(p?.titulo || ''),
      corpo: String(p?.corpo || ''),
    }));

    // Contato do vendedor entra no fim do corpo da última proposta preenchida — se o
    // chamador não mandar um explícito, usa nome do vendedor + e-mail (já temos os dois
    // sem precisar de UI nova pra digitar isso).
    const vendedorContato: string = body?.vendedorContato
      ? String(body.vendedorContato)
      : `Contato: ${perfil.nome || 'Equipe comercial'} — ${user.email}`;

    const { buffer, avisos } = await gerarPropostaPptxBuffer(empresaNome, propostas, vendedorContato);
    const nomeArquivo = `Proposta - ${empresaNome}.pptx`.replace(/[\\/:*?"<>|]/g, '');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'X-Pptx-Avisos': encodeURIComponent(JSON.stringify(avisos)),
      },
    });
  } catch (err: any) {
    console.error('[Max Proposta PPTX] Erro:', err);
    return NextResponse.json({ erro: err?.message || 'Erro ao gerar o arquivo.' }, { status: 500 });
  }
}
