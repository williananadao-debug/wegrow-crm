import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio, executarComando } from '@/lib/rastreio';

// Bloquear / desbloquear pelo painel. Travas em executarComando (lib/rastreio):
// veículo da empresa, motivo obrigatório, ≤ 20 km/h e posição de até 10 min; tudo registrado.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  if (!['diretor', 'gerente'].includes(u.cargo || '')) {
    return NextResponse.json({ error: 'Só diretor ou gerente pode bloquear veículo.' }, { status: 403 });
  }
  const { veiculoId, tipo, motivo } = await req.json().catch(() => ({}));
  if (!veiculoId || !['bloquear', 'desbloquear'].includes(tipo)) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }
  const r = await executarComando(db, {
    veiculoId, empresaId: u.empresaId, tipo, motivo: String(motivo || ''),
    autor: { userId: u.id, nome: u.nome, origem: 'painel' },
  });
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.erro }, { status: r.status });
}
