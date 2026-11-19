import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp } from '@/lib/rastreioApp';
import { ALERTAS_PADRAO, NOMES_ALERTA } from '@/lib/rastreioPush';

export const dynamic = 'force-dynamic';

// App nativo: grava o token de notificação do celular e as preferências de alerta do cliente.
// GET → preferências; POST { token, plataforma } → registra; POST { alertas } → salva preferências.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const { data } = await db.from('rastreio_clientes').select('app_alertas').eq('id', s.clienteId).maybeSingle();
  return NextResponse.json({ alertas: { ...ALERTAS_PADRAO, ...((data?.app_alertas as Record<string, boolean>) || {}) }, nomes: NOMES_ALERTA });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));

  if (corpo.alertas && typeof corpo.alertas === 'object') {
    const limpo = Object.fromEntries(Object.keys(ALERTAS_PADRAO).map(k => [k, Boolean(corpo.alertas[k])]));
    await db.from('rastreio_clientes').update({ app_alertas: limpo }).eq('id', s.clienteId);
    return NextResponse.json({ ok: true });
  }

  const token = String(corpo.token || '').trim();
  if (token.length < 20 || token.length > 4096) return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
  const plataforma = ['android', 'ios', 'web'].includes(corpo.plataforma) ? corpo.plataforma : 'android';
  const { error } = await db.from('rastreio_push_tokens').upsert(
    { token, plataforma, empresa_id: s.empresaId, cliente_id: s.clienteId, ultimo_uso: new Date().toISOString() },
    { onConflict: 'token' },
  );
  if (error) return NextResponse.json({ error: 'Não foi possível registrar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
