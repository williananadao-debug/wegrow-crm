import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { carregarConfig, integracaoAsaas, registrarPagamento } from '@/lib/rastreioCobranca';

export const dynamic = 'force-dynamic';

// Webhook da conta Asaas do INSTALADOR (cadastrado sozinho ao conectar a chave). Cada empresa
// tem a própria URL (?e=<empresa>) e o próprio token (header asaas-access-token).
export async function POST(req: NextRequest) {
  const empresaId = req.nextUrl.searchParams.get('e') || '';
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) return NextResponse.json({ ok: false }, { status: 400 });
  const db = supabaseAdmin();
  const cfg = await carregarConfig(db, empresaId);
  const recebido = Buffer.from(req.headers.get('asaas-access-token') || '');
  const esperado = Buffer.from(cfg.webhook_token || '');
  if (!esperado.length || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.payment?.id) return NextResponse.json({ ok: true, ignorado: true });
  try {
    const ig = await integracaoAsaas(db, empresaId);
    const r = await registrarPagamento(db, empresaId, { ...body.payment, ...(body.event === 'PAYMENT_DELETED' ? { deleted: true } : {}) }, ig);
    return NextResponse.json({ ok: true, cliente: r });
  } catch (err) {
    // 200 mesmo assim: o Asaas pausa a fila do webhook depois de erros seguidos; a
    // sincronização diária corrige o que faltar.
    console.error('[rastreio/asaas-webhook]', (err as Error).message);
    return NextResponse.json({ ok: false });
  }
}
