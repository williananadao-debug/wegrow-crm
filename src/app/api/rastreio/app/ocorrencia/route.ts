import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, veiculoLiberado } from '@/lib/rastreioApp';
import { abrirOcorrencia } from '@/lib/rastreioOcorrencia';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// App do cliente → "Fui roubado / furtado": abre a ocorrência e avisa a central na hora.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const c = await req.json().catch(() => ({}));
  const veiculoId = String(c.veiculoId || '');
  if (!veiculoLiberado(s, veiculoId)) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  const { data: cli } = await db.from('rastreio_clientes').select('nome').eq('id', s.clienteId).maybeSingle();
  try {
    const r = await abrirOcorrencia(db, {
      empresaId: s.empresaId, veiculoId, clienteId: s.clienteId, tipo: c.tipo === 'furto' ? 'furto' : 'roubo',
      descricao: String(c.descricao || '').slice(0, 500), origem: 'app', autor: { userId: null, nome: s.nome || cli?.nome || 'Cliente' },
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
