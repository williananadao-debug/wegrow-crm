import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, criarCompartilhamento, urlBase } from '@/lib/rastreioApp';

// App do cliente → link de localização ao vivo de um veículo dele.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const { veiculoId, horas } = await req.json().catch(() => ({}));
  const { data: v } = await db.from('rastreio_veiculos').select('id, placa')
    .eq('id', veiculoId).eq('cliente_id', s.clienteId).eq('empresa_id', s.empresaId).eq('status', 'ativo').maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  const { data: cli } = await db.from('rastreio_clientes').select('nome').eq('id', s.clienteId).maybeSingle();
  try {
    const { token, expira } = await criarCompartilhamento(db, { empresaId: s.empresaId, veiculoId: v.id, horas: Number(horas), criadoPor: cli?.nome || 'cliente', origem: 'app' });
    return NextResponse.json({ ok: true, link: `${urlBase(req)}/meu-rastreio/ao-vivo?t=${token}`, expira, placa: v.placa });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
