import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, soVeiculosDaSessao } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

// Trajeto de um dia (ini/fim em ISO, calculados no fuso do celular) de um veículo do cliente.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const veiculoId = sp.get('veiculo') || '';
  const ini = new Date(sp.get('ini') || ''), fim = new Date(sp.get('fim') || '');
  if (isNaN(+ini) || isNaN(+fim) || +fim - +ini > 2 * 86400_000 || +fim < +ini) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
  }
  const { data: v } = await soVeiculosDaSessao(db.from('rastreio_veiculos').select('id').eq('id', veiculoId), s).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  const { data } = await db.from('rastreio_posicoes').select('lat, lng, velocidade, ignicao, registrado_em')
    .eq('veiculo_id', v.id).gte('registrado_em', ini.toISOString()).lte('registrado_em', fim.toISOString())
    .order('registrado_em').limit(5000);
  return NextResponse.json({ pontos: data || [] });
}
