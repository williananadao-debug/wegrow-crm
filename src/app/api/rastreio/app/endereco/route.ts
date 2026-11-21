import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, soVeiculosDaSessao } from '@/lib/rastreioApp';
import { enderecoDoVeiculo, COLS_ENDERECO } from '@/lib/rastreioEndereco';

export const dynamic = 'force-dynamic';

// Endereço da posição atual de um veículo do cliente (app).
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('veiculo') || '';
  const { data: v } = await soVeiculosDaSessao(db.from('rastreio_veiculos').select(COLS_ENDERECO).eq('id', id), s).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  return NextResponse.json({ endereco: await enderecoDoVeiculo(db, v) });
}
