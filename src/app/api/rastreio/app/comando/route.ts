import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { executarComando } from '@/lib/rastreio';
import { COOKIE_APP, obterSessaoApp, conferePin } from '@/lib/rastreioApp';

const MAX_PIN_ERRADO = 5;      // por 15 minutos, por cliente
const JANELA_MIN = 15;

// Bloquear / desbloquear pelo app do cliente: exige o PIN; mesmas travas do painel.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const { veiculoId, tipo, motivo, pin } = await req.json().catch(() => ({}));
  if (!veiculoId || !['bloquear', 'desbloquear'].includes(tipo)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  const { data: cli } = await db.from('rastreio_clientes').select('nome, app_pin_hash').eq('id', s.clienteId).maybeSingle();
  if (!cli?.app_pin_hash) return NextResponse.json({ error: 'Crie seu PIN de bloqueio primeiro.' }, { status: 409 });

  // Trava contra chute de PIN: conta as recusas por PIN errado nos veículos deste cliente.
  const { data: vs } = await db.from('rastreio_veiculos').select('id').eq('cliente_id', s.clienteId);
  const ids = (vs || []).map(v => v.id as string);
  const desde = new Date(Date.now() - JANELA_MIN * 60000).toISOString();
  const { count } = ids.length
    ? await db.from('rastreio_comandos').select('id', { count: 'exact', head: true })
        .in('veiculo_id', ids).eq('origem', 'app').eq('detalhe', 'PIN incorreto').gte('created_at', desde)
    : { count: 0 };
  if ((count || 0) >= MAX_PIN_ERRADO) {
    return NextResponse.json({ error: `Muitas tentativas com PIN errado. Aguarde ${JANELA_MIN} minutos ou ligue para a central.` }, { status: 429 });
  }
  if (!conferePin(String(pin || ''), cli.app_pin_hash)) {
    if (ids.includes(veiculoId)) {
      await db.from('rastreio_comandos').insert({
        empresa_id: s.empresaId, veiculo_id: veiculoId, tipo, status: 'recusado', detalhe: 'PIN incorreto',
        origem: 'app', user_nome: cli.nome, motivo: String(motivo || '').slice(0, 300),
      });
    }
    return NextResponse.json({ error: 'PIN incorreto.' }, { status: 403 });
  }

  const r = await executarComando(db, {
    veiculoId, empresaId: s.empresaId, clienteId: s.clienteId, tipo, motivo: String(motivo || ''),
    autor: { userId: null, nome: cli.nome, origem: 'app' },
  });
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.erro }, { status: r.status });
}
