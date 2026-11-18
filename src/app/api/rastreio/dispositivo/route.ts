import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio, traccarConfigurado, garantirDispositivoTraccar } from '@/lib/rastreio';

// Chamado depois de salvar um veículo: cadastra o IMEI no Traccar (se o servidor já existir).
// Sem servidor configurado não é erro — o vínculo acontece sozinho quando a 1ª posição chegar.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });

  const { veiculoId } = await req.json().catch(() => ({}));
  const { data: v } = await db.from('rastreio_veiculos').select('id, imei, placa, descricao')
    .eq('id', veiculoId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  if (!traccarConfigurado()) return NextResponse.json({ ok: true, pendente: true, mensagem: 'Servidor de rastreio ainda não configurado.' });
  try {
    const deviceId = await garantirDispositivoTraccar(v.imei, [v.placa, v.descricao].filter(Boolean).join(' · '));
    await db.from('rastreio_veiculos').update({ traccar_device_id: deviceId }).eq('id', v.id);
    return NextResponse.json({ ok: true, deviceId });
  } catch (err) {
    return NextResponse.json({ ok: false, mensagem: `Veículo salvo, mas o servidor de rastreio respondeu: ${(err as Error).message}` });
  }
}
