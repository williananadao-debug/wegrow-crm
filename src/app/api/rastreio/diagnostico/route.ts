import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'dns/promises';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio, traccarConfigurado, diagnosticoTraccar, garantirDispositivoTraccar } from '@/lib/rastreio';

export const dynamic = 'force-dynamic';

// Assistente de instalação: como o aparelho aparece no servidor de rastreio agora, e para onde
// ele deve mandar (IP + porta), para montar os comandos SMS na tela.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const { veiculoId } = await req.json().catch(() => ({}));
  const { data: v } = await db.from('rastreio_veiculos').select('id, imei, placa, descricao')
    .eq('id', veiculoId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  if (!traccarConfigurado()) return NextResponse.json({ configurado: false });

  const host = new URL(String(process.env.TRACCAR_URL)).hostname;
  const ip = await lookup(host, { family: 4 }).then(r => r.address).catch(() => null);
  try {
    let d = await diagnosticoTraccar(v.imei);
    if (!d.cadastrado) {
      // Veículo salvo antes do servidor existir: cadastra agora.
      const id = await garantirDispositivoTraccar(v.imei, [v.placa, v.descricao].filter(Boolean).join(' · '));
      await db.from('rastreio_veiculos').update({ traccar_device_id: id }).eq('id', v.id);
      d = await diagnosticoTraccar(v.imei);
    }
    return NextResponse.json({ configurado: true, host, ip, traccar: d, consultadoEm: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ configurado: true, host, ip, erro: (err as Error).message });
  }
}
