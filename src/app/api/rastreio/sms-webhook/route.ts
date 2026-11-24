import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

// Webhook do httpSMS: SMS recebido no celular-ponte. Se veio do chip de um rastreador
// cadastrado, vira "resposta do aparelho" no veículo (mesmo lugar das respostas pela internet).
// URL configurada no httpSMS: https://www.wegrow.app.br/api/rastreio/sms-webhook?token=<SMS_WEBHOOK_TOKEN>
export async function POST(req: NextRequest) {
  const token = process.env.SMS_WEBHOOK_TOKEN;
  if (!token || req.nextUrl.searchParams.get('token') !== token) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const tipo = String(corpo?.type || corpo?.event || '');
  const d = corpo?.data || {};
  if (tipo && !tipo.includes('received')) return NextResponse.json({ ok: true, ignorado: tipo });
  const de = String(d.contact || d.from || '').replace(/\D/g, '');
  const texto = String(d.content || d.message || '').slice(0, 1000);
  if (de.length < 8 || !texto) return NextResponse.json({ ok: true, ignorado: 'sem remetente/texto' });

  // Compara pelos últimos 8 dígitos (o chip pode estar cadastrado com ou sem DDD/DDI)
  const final = de.slice(-8);
  const db = supabaseAdmin();
  const { data: candidatos } = await db.from('rastreio_veiculos').select('id, empresa_id, placa, chip_numero').ilike('chip_numero', `%${final.slice(-4)}%`).limit(50);
  const v = (candidatos || []).find(x => String(x.chip_numero || '').replace(/\D/g, '').endsWith(final));
  if (!v) return NextResponse.json({ ok: true, ignorado: 'número não é de rastreador cadastrado' });

  await db.from('rastreio_eventos').insert({
    empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'resposta_aparelho', lido: true,
    mensagem: `${v.placa}: resposta do aparelho (SMS): ${texto}`,
  });
  return NextResponse.json({ ok: true, veiculo: v.placa });
}
