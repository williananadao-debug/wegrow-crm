import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { rodarRegua, sincronizarAssinatura } from '@/lib/cobrancaWegrow';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Diário (9h de Brasília) — cobrança recorrente da própria WeGrow:
// 1) puxa do Asaas os pagamentos de cada assinatura ativa (rede de segurança do webhook);
// 2) roda a régua: lembrete antes do vencimento, avisos depois e, se ligada, a suspensão.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  const db = supabaseAdmin();
  const resultado = { sincronizadas: 0, erros: [] as string[], regua: null as any };

  if (process.env.ASAAS_API_KEY) {
    const { data: ativas } = await db.from('clientes_wegrow').select('empresa_id').eq('assinatura_status', 'ativa').not('asaas_subscription_id', 'is', null);
    for (const a of ativas || []) {
      try { await sincronizarAssinatura(db, a.empresa_id); resultado.sincronizadas++; }
      catch (err: any) { resultado.erros.push(`${a.empresa_id}: ${err.message}`); }
    }
  }
  resultado.regua = await rodarRegua(db);

  console.log('[cron/cobranca-wegrow]', JSON.stringify(resultado));
  return NextResponse.json({ ok: true, ...resultado });
}
