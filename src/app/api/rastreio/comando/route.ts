import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import {
  usuarioRastreio, traccarConfigurado, enviarComandoTraccar, garantirDispositivoTraccar,
  VELOCIDADE_MAX_BLOQUEIO, POSICAO_RECENTE_MIN,
} from '@/lib/rastreio';

// Bloquear / desbloquear. Travas:
//  - só diretor/gerente/operador da empresa dona do veículo;
//  - bloqueio só com a última posição recente (≤ 10 min) e velocidade ≤ 20 km/h;
//  - motivo obrigatório; tudo fica em rastreio_comandos (inclusive as recusas).
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
  if (!String(motivo || '').trim()) return NextResponse.json({ error: 'Informe o motivo.' }, { status: 400 });

  const { data: v } = await db.from('rastreio_veiculos')
    .select('id, empresa_id, placa, imei, tem_bloqueio, traccar_device_id, ultima_velocidade, ultima_posicao_em, ultima_lat, ultima_lng')
    .eq('id', veiculoId).eq('empresa_id', u.empresaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  const log = (status: 'enviado' | 'recusado' | 'erro', detalhe: string) => db.from('rastreio_comandos').insert({
    empresa_id: v.empresa_id, veiculo_id: v.id, tipo, status, motivo: String(motivo).trim().slice(0, 300), detalhe,
    velocidade_no_momento: v.ultima_velocidade, lat: v.ultima_lat, lng: v.ultima_lng, user_id: u.id, user_nome: u.nome,
  });
  const recusar = async (msg: string, status = 409) => { await log('recusado', msg); return NextResponse.json({ error: msg }, { status }); };

  if (!v.tem_bloqueio) return recusar('Este veículo não tem relé de bloqueio instalado.');

  if (tipo === 'bloquear') {
    const idadeMin = v.ultima_posicao_em ? (Date.now() - new Date(v.ultima_posicao_em).getTime()) / 60000 : Infinity;
    if (idadeMin > POSICAO_RECENTE_MIN) {
      return recusar(`Última posição tem mais de ${POSICAO_RECENTE_MIN} min — sem como garantir que o veículo está parado. Aguarde o rastreador comunicar.`);
    }
    if (Number(v.ultima_velocidade || 0) > VELOCIDADE_MAX_BLOQUEIO) {
      return recusar(`Veículo a ${v.ultima_velocidade} km/h. Por segurança o bloqueio só é enviado abaixo de ${VELOCIDADE_MAX_BLOQUEIO} km/h.`);
    }
  }

  if (!traccarConfigurado()) return recusar('Servidor de rastreio ainda não configurado (TRACCAR_URL).', 503);

  try {
    let deviceId = v.traccar_device_id as number | null;
    if (!deviceId) {
      deviceId = await garantirDispositivoTraccar(v.imei, v.placa);
      await db.from('rastreio_veiculos').update({ traccar_device_id: deviceId }).eq('id', v.id);
    }
    const { naFila } = await enviarComandoTraccar(deviceId, tipo);
    const detalhe = naFila ? 'Aparelho offline: comando na fila, executa quando ele comunicar.' : 'Comando entregue ao aparelho.';
    await log('enviado', detalhe);
    await db.from('rastreio_veiculos').update({ bloqueado: tipo === 'bloquear' }).eq('id', v.id);
    await db.from('rastreio_eventos').insert({
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'comando', lido: true,
      mensagem: `${v.placa}: ${tipo === 'bloquear' ? 'BLOQUEIO' : 'desbloqueio'} enviado por ${u.nome} — ${String(motivo).trim()}`,
      lat: v.ultima_lat, lng: v.ultima_lng,
    });
    return NextResponse.json({ ok: true, naFila, mensagem: detalhe });
  } catch (err) {
    const msg = (err as Error).message;
    await log('erro', msg);
    return NextResponse.json({ error: `Falha ao enviar: ${msg}` }, { status: 502 });
  }
}
