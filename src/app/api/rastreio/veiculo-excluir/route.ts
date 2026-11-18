import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio, traccarConfigurado, removerDispositivoTraccar } from '@/lib/rastreio';

// Exclui o veículo de vez (posições, eventos, comandos, cercas e links vão junto, ON DELETE CASCADE)
// e tira o aparelho do servidor de rastreio se nenhum outro veículo usa o mesmo IMEI.
// Só diretor/gerente — para manter o histórico, o caminho normal é "Desativar".
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  if (u.cargo !== 'diretor' && u.cargo !== 'gerente') return NextResponse.json({ error: 'Só diretor ou gerente pode excluir veículos.' }, { status: 403 });

  const { veiculoId } = await req.json().catch(() => ({}));
  const { data: v } = await db.from('rastreio_veiculos').select('id, imei, placa, traccar_device_id')
    .eq('id', veiculoId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  const { error } = await db.from('rastreio_veiculos').delete().eq('id', v.id);
  if (error) return NextResponse.json({ error: `Não foi possível excluir: ${error.message}` }, { status: 500 });

  let aviso = '';
  if (v.traccar_device_id && traccarConfigurado()) {
    const { count } = await db.from('rastreio_veiculos').select('id', { count: 'exact', head: true }).eq('imei', v.imei);
    if (!count) await removerDispositivoTraccar(v.traccar_device_id).catch(e => { aviso = ` (servidor de rastreio: ${(e as Error).message})`; });
  }
  return NextResponse.json({ ok: true, mensagem: `${v.placa} excluído.${aviso}` });
}
