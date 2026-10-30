import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { STATUS_ASAAS_PAGOS } from '@/lib/asaas';
import { asaasWegrow, carregarConfigNf, emitirNfWegrow, sincronizarPendentesNfWegrow } from '@/lib/nfWegrow';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Rede de segurança diária da NFS-e da WeGrow, pro caso do webhook não chegar:
// 1) puxa do Asaas o andamento das notas em processamento (e manda o e-mail das autorizadas);
// 2) cobrança Asaas da mensalidade que já foi paga e ainda não tem nota → emite.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  const db = supabaseAdmin();
  const resultado = { sincronizadas: 0, emitidas: 0, erros: [] as string[] };

  resultado.sincronizadas = await sincronizarPendentesNfWegrow(db);

  const config = await carregarConfigNf(db);
  if (config?.ativo && process.env.ASAAS_API_KEY) {
    const { data: billings } = await db.from('clientes_wegrow').select('empresa_id, ultima_cobranca_id').not('ultima_cobranca_id', 'is', null);
    for (const b of billings || []) {
      const { data: jaTem } = await db.from('wegrow_notas_fiscais').select('id').eq('asaas_payment_id', b.ultima_cobranca_id).not('status', 'eq', 'ERROR').limit(1).maybeSingle();
      if (jaTem) continue;
      try {
        const pg = await asaasWegrow('GET', `/payments/${b.ultima_cobranca_id}`);
        if (!STATUS_ASAAS_PAGOS.includes(pg.status)) continue;
        const r = await emitirNfWegrow(db, { empresaId: b.empresa_id, paymentId: pg.id, competencia: String(pg.dueDate || '').substring(0, 7) || undefined, origem: 'cron' });
        if (r.ok && !r.jaExistia) resultado.emitidas++;
        if (!r.ok) resultado.erros.push(`${b.empresa_id}: ${r.erro}`);
      } catch (err: any) {
        resultado.erros.push(`${b.empresa_id}: ${err.message}`);
      }
    }
  }

  console.log('[cron/nf-wegrow]', JSON.stringify(resultado));
  return NextResponse.json({ ok: true, ...resultado });
}
