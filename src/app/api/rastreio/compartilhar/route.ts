import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { criarCompartilhamento, urlBase } from '@/lib/rastreioApp';

// Painel → link de localização ao vivo com validade.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { veiculoId, horas } = await req.json().catch(() => ({}));
  const { data: v } = await db.from('rastreio_veiculos').select('id, placa')
    .eq('id', veiculoId).eq('empresa_id', u.empresaId).eq('status', 'ativo').maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  try {
    const { token, expira } = await criarCompartilhamento(db, { empresaId: u.empresaId, veiculoId: v.id, horas: Number(horas), criadoPor: u.nome, origem: 'painel' });
    return NextResponse.json({ ok: true, link: `${urlBase(req)}/meu-rastreio/ao-vivo?t=${token}`, expira, placa: v.placa });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
