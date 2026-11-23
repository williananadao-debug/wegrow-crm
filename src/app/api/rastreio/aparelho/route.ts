import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { configurarAparelho, COMANDOS, type ComandoAparelho } from '@/lib/rastreioAparelho';

export const dynamic = 'force-dynamic';

// Comandos de configuração do rastreador pelo painel (localizar, status, intervalo, SOS...).
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  if (!['diretor', 'gerente'].includes(u.cargo || '')) {
    return NextResponse.json({ error: 'Só diretor ou gerente configura o rastreador.' }, { status: 403 });
  }
  const { veiculoId, comando, params } = await req.json().catch(() => ({}));
  if (!veiculoId || !(String(comando) in COMANDOS)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  try {
    const r = await configurarAparelho(db, {
      empresaId: u.empresaId, veiculoId: String(veiculoId), comando: comando as ComandoAparelho, params: params || {},
      autor: { userId: u.id, nome: u.nome },
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
