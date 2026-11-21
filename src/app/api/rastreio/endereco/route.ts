import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { enderecoDoVeiculo, COLS_ENDERECO } from '@/lib/rastreioEndereco';

// Endereço da posição atual de um veículo (painel). Cacheado no veículo.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { veiculoId } = await req.json().catch(() => ({}));
  const { data: v } = await db.from('rastreio_veiculos').select(COLS_ENDERECO).eq('id', veiculoId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  return NextResponse.json({ endereco: await enderecoDoVeiculo(db, v) });
}
