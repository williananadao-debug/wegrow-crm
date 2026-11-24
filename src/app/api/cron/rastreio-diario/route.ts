import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { rodarResumoDiario } from '@/lib/rastreioResumo';
import { rodarRelatoriosEmail } from '@/lib/rastreioRelatorioEmail';
import { verificarSemComunicacao } from '@/lib/rastreioCentral';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Diário (madrugada): resumo por dia de cada veículo, hodômetro, aviso de manutenção e
// relatório por e-mail dos clientes (segunda = semanal, dia 1 = mensal).
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const db = supabaseAdmin();
  const r = await rodarResumoDiario(db);
  const semComunicacao = await verificarSemComunicacao(db).catch(() => 0);
  // Depois do resumo (o e-mail usa o resumo de ontem já fechado).
  const e = await rodarRelatoriosEmail(db).catch(err => ({ relatoriosEmail: 0, erro: (err as Error).message }));
  return NextResponse.json({ ok: true, ...r, ...e, semComunicacao });
}
