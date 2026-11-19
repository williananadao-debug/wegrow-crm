import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { rodarResumoDiario } from '@/lib/rastreioResumo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Diário (madrugada): resumo por dia de cada veículo, hodômetro e aviso de manutenção.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const r = await rodarResumoDiario(supabaseAdmin());
  return NextResponse.json({ ok: true, ...r });
}
