import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Roda todo dia 1 (ver vercel.json) — sem isso não dá pra medir "MRR novo vs. perdido",
// só o valor atual existe. unique(ano,mes) faz o on_conflict ser idempotente se o cron
// rodar de novo por engano no mesmo mês.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = db();
  const { data: billings, error } = await supabase.from('clientes_wegrow').select('valor_mensal');
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const mrrTotal = (billings || []).reduce((s, b) => s + Number(b.valor_mensal || 0), 0);
  const hoje = new Date();

  const { error: upsertErr } = await supabase.from('mrr_snapshots_mensais').upsert({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth() + 1,
    mrr_total: mrrTotal,
    clientes: (billings || []).length,
  }, { onConflict: 'ano,mes' });

  if (upsertErr) return NextResponse.json({ erro: upsertErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, mrr_total: mrrTotal, clientes: (billings || []).length });
}
