import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { processarWebhookTraccar } from '@/lib/rastreio';

// Recebe o "forward" do Traccar — configurado no traccar.xml do servidor:
//   <entry key='forward.enable'>true</entry>
//   <entry key='forward.type'>json</entry>
//   <entry key='forward.url'>https://www.wegrow.app.br/api/rastreio/traccar?token=SEGREDO</entry>
//   <entry key='event.forward.enable'>true</entry>
//   <entry key='event.forward.url'>https://www.wegrow.app.br/api/rastreio/traccar?token=SEGREDO</entry>
// SEGREDO = TRACCAR_WEBHOOK_TOKEN na Vercel.
export async function POST(req: NextRequest) {
  const esperado = process.env.TRACCAR_WEBHOOK_TOKEN;
  if (!esperado || req.nextUrl.searchParams.get('token') !== esperado) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }

  try {
    const resultado = await processarWebhookTraccar(supabaseAdmin(), corpo);
    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    console.error('[rastreio/traccar] erro', err);
    // 200 mesmo com erro: o Traccar reenviaria em loop e a próxima posição já corrige o estado.
    return NextResponse.json({ ok: false, erro: (err as Error).message });
  }
}
