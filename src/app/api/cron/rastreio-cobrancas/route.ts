import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { sincronizarEmpresa } from '@/lib/rastreioCobranca';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Diário: puxa os pagamentos das assinaturas do Rastreio (rede de segurança do webhook) e
// aplica atraso/suspensão automática/reativação de cada cliente.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: empresas } = await db.from('rastreio_clientes').select('empresa_id').not('asaas_assinatura_id', 'is', null).limit(5000);
  const ids = [...new Set((empresas || []).map(e => e.empresa_id as string))];
  const resultado: Record<string, unknown> = {};
  for (const id of ids) {
    resultado[id] = await sincronizarEmpresa(db, id).catch(e => ({ erro: (e as Error).message }));
  }
  return NextResponse.json({ ok: true, empresas: ids.length, resultado });
}
